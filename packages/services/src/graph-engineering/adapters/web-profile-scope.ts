import { revalidateWebProfileRuntime } from "@zcode/shared/node";
import type { GraphWorkspaceTarget } from "../approval-types.js";
import type { GraphWebProfileScope } from "../domain/project-budgets.js";
import { prepareWebProfileInputs } from "./web-profile-inputs.js";
import { readWebProfileRestore } from "./web-profile-restore.js";
import { readWebProfileProof } from "./web-profile-proof.js";
export async function revalidateWebProfileScope(
  directory: string | undefined,
  target: GraphWorkspaceTarget,
  scope: GraphWebProfileScope,
  deadline: number,
) {
  await readWebProfileProof(directory, target, scope);
  const selection = {
    webProject: scope.webProject,
    testProject: scope.project,
    configuration: scope.configuration,
  };
  const membership = await prepareWebProfileInputs(target, selection, deadline);
  if (
    membership.membershipDigest !== scope.membershipDigest ||
    membership.sourcePaths.length !== scope.sourceCount
  )
    throw Error("Web profile input membership or metadata changed; prepare again.");
  const restored = await readWebProfileRestore(target, selection, scope.runtimeProfile.executable);
  if (restored.packageRoot !== scope.runtimeProfile.packageRoot)
    throw Error("Web package root changed.");
  await revalidateWebProfileRuntime(
    target.workspacePath,
    scope.runtimeProfile,
    undefined,
    deadline,
  );
  return membership.sourcePaths;
}
