import type { GraphRecipe } from "./artifact-types.js";
import type { GraphWebProfileScope } from "./domain/project-budgets.js";
export interface GraphWebProfileProposal {
  kind: "web-profile-proposal";
  scope: GraphWebProfileScope;
  recipes: GraphRecipe[];
  sourcePaths: string[];
  excludedOutputRoots: string[];
  facts: string[];
}
