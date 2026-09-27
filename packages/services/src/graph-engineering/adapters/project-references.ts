import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";
import type { ZCodeExecutionEnvironmentPreview } from "@zcode/shared";
import type { GraphWorkspaceTarget } from "../contract.js";
import type { GraphReferenceValidation } from "../project-setup-types.js";
import { readDeclaredFileSnapshot } from "./artifact-files.js";
import { validateGraphRelativePath } from "../domain/artifact-schemas.js";

export async function readProjectReference(target: GraphWorkspaceTarget, input: string) {
  if (typeof input !== "string" || !input.trim() || input.length > 4096 || input.includes("\0"))
    throw new Error("Select a bounded workspace reference path.");
  const path = (
    isAbsolute(input) ? relative(resolve(target.workspacePath), input) : input
  ).replaceAll("\\", "/");
  validateGraphRelativePath(path);
  const snapshot = await readDeclaredFileSnapshot(target, path, 100 * 1024);
  const text = new TextDecoder("utf-8", { fatal: true }).decode(snapshot.content);
  if (!text.trim() || text.includes("\0"))
    throw new Error("Reference must be a nonempty UTF-8 text file.");
  // 原始字节用于大小/路径校验，正文摘要保持现有 native guidance 的 UTF-8 内容语义。
  const digest = createHash("sha256").update(snapshot.content.toString("utf8")).digest("hex");
  return { path, digest, bytes: snapshot.bytes };
}

export function nativeReferenceDelivery(
  target: GraphWorkspaceTarget,
  reference: { path: string; digest: string; bytes: number },
  environment: ZCodeExecutionEnvironmentPreview,
): GraphReferenceValidation["delivery"] {
  const absolute = resolve(target.workspacePath, reference.path);
  const comparable = (path: string) => (process.platform === "win32" ? path.toLowerCase() : path);
  // 同名文件并不代表 native 已加载；只有路径、完整内容摘要与字节数一致才能省去重复 Read。
  return environment.status === "available" &&
    environment.instructions.some(
      (instruction) =>
        !instruction.truncated &&
        instruction.digest === reference.digest &&
        instruction.bytes === reference.bytes &&
        comparable(resolve(target.workspacePath, instruction.path)) === comparable(absolute),
    )
    ? "native-instructions"
    : "explicit-read";
}
