import type { GraphApprovalNode } from "../contract.js";
import { from, graph, portable, position, request, task } from "./workflow-sample-nodes.js";

const finalGate: GraphApprovalNode = {
  id: "final-gate",
  type: "approval",
  name: "Final human review",
  position,
  reviewInstructions:
    "Review the actual changes, agent findings and unresolved questions. Verification is agent-led; configured test evidence is not included. Approval does not establish that tests passed or authorize commit, merge or publication.",
  evidence: [
    { alias: "review", source: { kind: "node", nodeId: "review" } },
    { alias: "implementation", source: { kind: "node", nodeId: "implement" } },
    { alias: "source", source: { kind: "source" } },
  ],
  commentPolicy: "required",
};

const definition = graph(
  "Agent-assisted task",
  [
    task(
      "analyze",
      "Analyze",
      "Inspect the explicit request, relevant native project instructions and source. Identify a bounded implementation and acceptance criteria. Preserve unrelated work. Do not edit or execute commands. Missing requirements remain questions.",
      [request],
    ),
    task(
      "implement",
      "Implement",
      "Implement the explicit request using the supplied analysis and normal native tools and permissions. Read current source first and preserve unrelated work. Report actual edits, checks performed, limitations and unresolved questions. This workflow has no configured machine-test verification; never claim one exists. Do not commit, merge or publish.",
      [request, from("analyze")],
    ),
    task(
      "review",
      "Review",
      "Inspect the actual changes against the explicit request, analysis and implementation handoff. Do not edit or execute commands. Distinguish observed source findings from agent-reported checks. Report remaining issues and what a human should inspect. Verification is agent-led; configured test evidence is not included. Agent prose cannot establish machine-verified success.",
      [request, from("analyze"), from("implement")],
    ),
    finalGate,
  ],
  ["analyze", "implement", "review", "final-gate"],
);
const end = definition.nodes.find((node) => node.type === "end")!;
end.outputNodeId = "review";

/** Independent policy: never weaken or rewrite the existing verified template versions. */
export const agentAssistedTemplate = portable(
  "Agent-assisted task",
  "Analyze, implement and review through native sessions, then require final human approval. Verification: agent-led review; configured test evidence not included. No project checks required.",
  definition,
);
agentAssistedTemplate.references = [
  {
    id: "instructions",
    label: "Additional project instructions",
    kind: "instruction",
    required: false,
    nodeIds: ["analyze", "implement", "review"],
  },
  {
    id: "skill",
    label: "Existing native skill",
    kind: "skill",
    required: false,
    nodeIds: ["implement"],
  },
];
