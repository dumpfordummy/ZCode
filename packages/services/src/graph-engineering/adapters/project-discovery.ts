import { lstat } from "node:fs/promises";
import { join } from "node:path";
import type { GraphWorkspaceTarget } from "../contract.js";
import { workspaceKey } from "../domain/definition.js";
import { validateGraphRelativePath } from "../domain/artifact-schemas.js";
import { ProjectScanJob, metadataName } from "./project-scan-job.js";
import { prepareProjectScope } from "./project-scope.js";

/** Sole ephemeral job owner. Detection/cancellation never admits native execution. */
export function createProjectDiscovery(limits: { maximumFiles?: number } = {}) {
  const jobs = new Map<string, ProjectScanJob>();
  return {
    cancelScan(target: GraphWorkspaceTarget, requestId: string) {
      const job = jobs.get(workspaceKey(target));
      if (job?.result.requestId === requestId) job.cancelled = true;
    },
    progress(target: GraphWorkspaceTarget, requestId: string) {
      const job = jobs.get(workspaceKey(target));
      return job?.result.requestId === requestId
        ? { ...job.progress }
        : {
            kind: "scan-progress" as const,
            requestId,
            stage: "complete" as const,
            entries: 0,
            metadata: 0,
            bytes: 0,
          };
    },
    async scan(
      target: GraphWorkspaceTarget,
      requestId: string,
      options: { scanRoot?: string; selectedProject?: string } = {},
    ) {
      const key = workspaceKey(target);
      const previous = jobs.get(key);
      if (previous) previous.cancelled = true;
      const job = new ProjectScanJob(target, requestId, limits.maximumFiles);
      jobs.set(key, job);
      try {
        const root = await job.directory("");
        if (options.selectedProject) await prepareProjectScope(job, options.selectedProject);
        else {
          const scanRoot = options.scanRoot === "." ? "" : (options.scanRoot ?? "");
          if (scanRoot) validateGraphRelativePath(scanRoot);
          job.result.scanRoot = scanRoot || ".";
          const info = scanRoot ? await lstat(join(target.workspacePath, scanRoot)) : root.info;
          if (info.isFile()) await job.metadata(scanRoot);
          else
            await job.walk(
              scanRoot,
              async (path) => {
                if (metadataName.test(path.split("/").at(-1)!)) await job.metadata(path);
              },
              false,
            );
        }
        const after = await job.directory("");
        if (
          after.info.dev !== root.info.dev ||
          after.info.ino !== root.info.ino ||
          after.canonical !== root.canonical
        )
          throw Error("Workspace was replaced during scan.");
      } catch (error) {
        job.issue(error instanceof Error ? error.message : "Scan interrupted.");
      } finally {
        if (jobs.get(key) === job) jobs.delete(key);
      }
      return job.finish();
    },
  };
}
