import type { GraphWorkspaceTarget } from "../approval-types.js";
import { prepareWebProfileInputs } from "./web-profile-inputs.js";
/** Completed matching input closure only; passive inspection never executes MSBuild. */
export async function findWebProfileChoices(
  target: GraphWorkspaceTarget,
  webProject: string,
  configuration: "Debug" | "Release",
  candidates: string[],
) {
  if (
    !Array.isArray(candidates) ||
    candidates.length > 32 ||
    new Set(candidates).size !== candidates.length
  )
    throw Error("At most 32 distinct discovered test candidates are supported.");
  const tests: string[] = [],
    issues: string[] = [];
  const deadline = Date.now() + 120000;
  for (const testProject of candidates) {
    if (testProject === webProject) continue;
    try {
      await prepareWebProfileInputs(target, { webProject, testProject, configuration }, deadline);
      tests.push(testProject);
    } catch (error) {
      issues.push(
        `${testProject}: ${error instanceof Error ? error.message : "Unsupported closure"}`.slice(
          0,
          1000,
        ),
      );
    }
  }
  return { kind: "web-profile-choices" as const, tests, issues };
}
