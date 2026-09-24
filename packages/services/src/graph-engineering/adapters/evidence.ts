import { createHash } from "node:crypto";
import type { IGitService } from "../../index.js";
import type { GraphEvidencePort } from "../app/ports.js";

export function createGraphEvidencePort(
  git: Pick<IGitService, "getSourceSnapshot">,
): GraphEvidencePort {
  return {
    captureSource: (target) => git.getSourceSnapshot({ workspacePath: target.workspacePath }),
    digest: (value) => createHash("sha256").update(value).digest("hex"),
  };
}
