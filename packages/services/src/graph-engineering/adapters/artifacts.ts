import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { redactFeedbackText } from "@zcode/shared";
import type {
  GraphArtifact,
  GraphArtifactIdentity,
  GraphArtifactStore,
  GraphArtifactWrite,
} from "../artifact-types.js";
import { graphArtifactSchema } from "../domain/artifact-schemas.js";
import { GRAPH_ARTIFACT_BYTES, parseBoundedGraphJson } from "../domain/artifacts.js";
import { workspaceKey } from "../domain/definition.js";
import { assertWorkspaceFilePath, readDeclaredFile } from "./artifact-files.js";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
function redactArtifactContent(content: string): string {
  const scrubbed = redactFeedbackText(content);
  if (scrubbed === content || scrubbed === content.replace(/\r\n/g, "\n")) return content;
  try {
    // 通用反馈清洗会压缩无敏感字段的 JSON；只有严格解析证明值未变时才保留原字节，
    // 避免把格式变化误判为脱敏。不能用 JSON.parse，否则重复键能隐藏被覆盖的秘密。
    if (
      JSON.stringify(parseBoundedGraphJson(content)) ===
      JSON.stringify(parseBoundedGraphJson(scrubbed))
    )
      return content;
  } catch {
    // 非 JSON、重复键及超限内容保持保守清洗结果，不能恢复未验证的原始内容。
  }
  return scrubbed;
}
function validateIdentity(input: GraphArtifactIdentity): void {
  for (const value of [
    input.artifactId,
    input.runId,
    input.nodeId,
    input.attemptId,
    workspaceKey(input.target),
  ])
    if (typeof value !== "string" || !value.trim() || value.length > 4096)
      throw new Error("Invalid artifact ownership identity.");
}
export function createGraphArtifactStore(directory: string): GraphArtifactStore {
  const pathFor = (identity: GraphArtifactIdentity) => {
    validateIdentity(identity);
    return join(
      directory,
      "artifacts",
      digest(workspaceKey(identity.target)),
      digest(identity.runId),
      `${digest(identity.artifactId)}.json`,
    );
  };
  const read = async (identity: GraphArtifactIdentity) => {
    const path = relative(directory, pathFor(identity)).split(sep).join("/");
    const bytes = await readDeclaredFile(
      { workspacePath: directory },
      path,
      GRAPH_ARTIFACT_BYTES * 7,
    );
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (
      !value ||
      typeof value !== "object" ||
      !("artifact" in value) ||
      !("content" in value) ||
      typeof value.content !== "string"
    )
      throw new Error("Invalid artifact storage record.");
    const artifact = graphArtifactSchema.parse(value.artifact),
      content = value.content;
    if (
      artifact.id !== identity.artifactId ||
      artifact.runId !== identity.runId ||
      artifact.nodeId !== identity.nodeId ||
      artifact.attemptId !== identity.attemptId ||
      artifact.workspaceKey !== workspaceKey(identity.target)
    )
      throw new Error("Artifact ownership mismatch.");
    if (Buffer.byteLength(content) !== artifact.bytes || digest(content) !== artifact.digest)
      throw new Error("Artifact digest/byte length mismatch.");
    return { artifact, content };
  };
  const put = async (input: GraphArtifactWrite): Promise<GraphArtifact> => {
    const path = pathFor(input);
    let content = input.content,
      validation = input.validation ?? "valid",
      issue = input.issue;
    if (typeof content !== "string") throw new Error("Artifact content must be text.");
    if (Buffer.byteLength(content) > GRAPH_ARTIFACT_BYTES) {
      content = "";
      validation = "incomplete";
      issue =
        "Artifact exceeds the 256 KiB retained content limit; no partial binding is available.";
    }
    const retained = redactArtifactContent(content),
      redacted = retained !== content;
    if (redacted) {
      validation = "incomplete";
      issue = [
        issue,
        "Native redaction changed retained evidence; it is not an unmodified validation input.",
      ]
        .filter(Boolean)
        .join(" ");
    }
    const artifact = graphArtifactSchema.parse({
      id: input.artifactId,
      runId: input.runId,
      nodeId: input.nodeId,
      attemptId: input.attemptId,
      workspaceKey: workspaceKey(input.target),
      type: input.type,
      provenance: input.provenance,
      bytes: Buffer.byteLength(retained),
      digest: digest(retained),
      capturedAt: input.capturedAt,
      validation,
      ...(issue ? { issue: issue.slice(0, 1000) } : {}),
      ...(redacted ? { redacted: true } : {}),
      ...Object.fromEntries(
        [
          "sourceBaseline",
          "sourcePath",
          "sessionId",
          "inputId",
          "commandId",
          "operationId",
        ].flatMap((key) =>
          input[key as keyof GraphArtifactWrite] === undefined
            ? []
            : [[key, input[key as keyof GraphArtifactWrite]]],
        ),
      ),
    });
    const serialized = JSON.stringify({ artifact, content: retained });
    await mkdir(directory, { recursive: true });
    const relativePath = relative(directory, path).split(sep).join("/");
    await assertWorkspaceFilePath({ workspacePath: directory }, relativePath, true);
    await mkdir(dirname(path), { recursive: true });
    await assertWorkspaceFilePath({ workspacePath: directory }, relativePath, true);
    try {
      await writeFile(path, serialized, { encoding: "utf8", flag: "wx", mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existing = await read(input);
      if (JSON.stringify(existing) !== serialized)
        throw new Error("Conflicting immutable artifact write.");
    }
    return artifact;
  };
  return {
    put,
    read,
    async captureFile(input) {
      let content = "",
        issue: string | undefined;
      try {
        const bytes = await readDeclaredFile(input.target, input.path, GRAPH_ARTIFACT_BYTES);
        content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
        if (
          Array.from(content).some((char) => {
            const code = char.charCodeAt(0);
            return code < 9 || code === 11 || (code >= 14 && code < 32) || code === 127;
          })
        )
          throw new Error("Binary file artifact is unsupported.");
      } catch (error) {
        content = "";
        issue = error instanceof Error ? error.message : "Declared file capture failed.";
      }
      return put({
        ...input,
        type: /\.(?:diff|patch)$/i.test(input.path) ? "diff" : "file",
        provenance: "workspace-file",
        content,
        sourcePath: input.path,
        validation: issue ? "incomplete" : input.validation,
        issue: issue ?? input.issue,
      });
    },
  };
}
