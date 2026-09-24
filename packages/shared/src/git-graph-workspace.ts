/** App-owned local clones. Paths are assigned by the Host, never supplied as cleanup targets. */
export interface GitGraphBase {
  workspacePath: string;
  head: string;
  digest: string;
  trackedPaths: string[];
}
export interface GitGraphWorkspace {
  ownerId: string;
  slot: string;
  workspacePath: string;
  base: GitGraphBase;
  token: string;
  configDigest: string;
  cleaned?: boolean;
}
export type GitGraphWorkspaceCommand =
  | { action: "prepare"; ownerId: string; slot: string; base: GitGraphBase; token: string }
  | { action: "validate"; workspace: GitGraphWorkspace };
