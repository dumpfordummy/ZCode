import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { declarativeProject, ProjectImportRequired } from "../domain/project-declarative.js";
import type { GraphWorkspaceTarget } from "../contract.js";

/** Imported bytes use the same bounded/identity-checked job and metadata recheck as projects. */
export async function loadDeclarativeProject(
  job: {
    target: GraphWorkspaceTarget;
    configuration: string;
    contents: ReadonlyMap<string, string>;
    check(): void;
    metadata(path: string): Promise<unknown>;
  },
  project: string,
) {
  const nearest = async (name: string) => {
    const parts = project.split("/").slice(0, -1);
    for (;;) {
      job.check();
      const path = [...parts, name].join("/");
      try {
        await lstat(join(job.target.workspacePath, path));
        return path;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      if (!parts.length) return undefined;
      parts.pop();
    }
  };
  const props = await nearest("Directory.Build.props");
  const packages = await nearest("Directory.Packages.props");
  const targets = await nearest("Directory.Build.targets");
  for (let count = 0; count < 65; count++) {
    job.check();
    try {
      return declarativeProject(
        project,
        job.contents,
        job.configuration,
        [props, packages].filter((p): p is string => !!p),
        targets ? [targets] : [],
      );
    } catch (error) {
      if (!(error instanceof ProjectImportRequired)) throw error;
      if (/\.(csproj|sln|slnx)$/i.test(error.path))
        throw Error("Importing a project/solution as metadata is unsupported.");
      await job.metadata(error.path);
    }
  }
  throw Error("Declarative import count budget exceeded.");
}
