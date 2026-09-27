import type { GraphArtifactOptions } from "../app/ports.js";
import { assertWorkspaceFilePath, readDeclaredFileSnapshot } from "./artifact-files.js";
import { parseGraphTrxReport } from "../domain/trx-report.js";
import { GRAPH_ARTIFACT_BYTES } from "../domain/artifacts.js";

/** One secure byte snapshot feeds original identity, privacy preview and the pure parser. */
export function createGraphReportCapture(): NonNullable<GraphArtifactOptions["reports"]> {
  return {
    async captureTrx(target, path, scope, startedAt, completedAt) {
      const snapshot = await readDeclaredFileSnapshot(target, path, GRAPH_ARTIFACT_BYTES);
      const original = {
        bytes: snapshot.bytes,
        digest: snapshot.digest,
        modifiedAt: snapshot.modifiedAt,
      };
      const content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        snapshot.content,
      );
      try {
        if (snapshot.modifiedAt < startedAt || Math.floor(snapshot.modifiedAt) > completedAt)
          throw new Error("TRX file timestamp is outside the exact native command window.");
        const assembly = await assertWorkspaceFilePath(target, scope.assembly);
        const report = parseGraphTrxReport({
          bytes: snapshot.content,
          target: scope,
          expectedAssemblyPath: assembly.absolutePath,
          pathCase: process.platform === "win32" ? "insensitive" : "sensitive",
          startedAt,
          completedAt,
        });
        return { content, original, report };
      } catch (error) {
        return {
          content,
          original,
          issue: error instanceof Error ? error.message : "TRX normalization failed.",
        };
      }
    },
  };
}
