import type { GraphPortableTemplate } from "../workflow-contract.js";
import {
  request,
  from,
  position,
  task,
  gate,
  reviewer,
  tools,
  graph,
  portable,
} from "./workflow-sample-nodes.js";

const generic = portable(
  "Sequential engineering",
  "Analyze an explicit request, implement it, execute operator-selected Build/Test recipes, review current evidence and require final human approval.",
  graph(
    "Sequential engineering",
    [
      task(
        "analyze",
        "Analyze",
        "Analyze the explicit request and selected project. Read relevant native project instructions and selected source references. Identify affected behavior, unknowns and acceptance criteria. Link each rule to a source reference or label it a question. Do not edit or execute commands.",
        [request],
      ),
      task(
        "implement",
        "Implement",
        "Implement only the approved request using the explicit Analyze handoff and normal native project tools. Preserve unrelated work and test authority. Do not invent missing rules or tooling; ask when blocked. Configured Build/Test nodes execute the verification recipes afterward.",
        [request, from("analyze")],
      ),
      ...tools(),
      reviewer(),
      gate("final-gate", "Final human review", "test", "test"),
    ],
    ["analyze", "implement", "build", "test", "reviewer", "final-gate"],
  ),
);
generic.references = [
  {
    id: "instructions",
    label: "Additional project instructions",
    kind: "instruction",
    required: false,
    nodeIds: ["analyze", "implement"],
  },
  {
    id: "skill",
    label: "Existing native skill",
    kind: "skill",
    required: false,
    nodeIds: ["implement"],
  },
];

const bugfixGraph = graph(
  "Bounded verified bug fix",
  [
    task(
      "implement",
      "Implement requested fix",
      "Inspect the explicit defect request and current source, then implement the smallest justified change. Preserve unrelated work and independent test authority. The configured native Build/Test nodes verify the actual result. Do not run replacement verification commands.",
      [request],
    ),
    ...tools(),
    reviewer(),
    task(
      "repair",
      "Repair from current evidence",
      "Use only the exact prior iteration findings and verification observations to make a bounded repair. Read current source before editing. Preserve tests and unrelated work. Do not fabricate results; separate native Build/Test nodes verify the change.",
      [{ alias: "feedback", source: { kind: "repair-feedback" } }],
    ),
    {
      id: "decision",
      type: "condition",
      name: "Classify current findings",
      position,
      inputs: [
        {
          alias: "review",
          source: { kind: "artifact", nodeId: "reviewer", selector: "structured" },
        },
        {
          alias: "machine",
          source: { kind: "artifact", nodeId: "test", selector: "verification" },
        },
      ],
      branches: [
        {
          exit: "pass",
          predicate: { op: "eq", alias: "review", pointer: "/outcome", value: "pass" },
        },
        {
          exit: "needs_changes",
          predicate: { op: "eq", alias: "review", pointer: "/outcome", value: "needs_changes" },
        },
      ],
      defaultExit: "needs_human",
      errorPolicy: "needs-human",
      verification: { testNodeIds: ["test"], reviewerNodeId: "reviewer", successExit: "pass" },
    },
    gate("final-gate", "Final human review", "test", "test"),
  ],
  ["implement", "build", "test", "reviewer", "decision", "final-gate"],
);
bugfixGraph.edges = bugfixGraph.edges
  .filter((edge) => edge.source !== "decision")
  .concat([
    { source: "repair", target: "build" },
    { source: "decision", target: "final-gate", sourcePort: "pass" },
    { source: "decision", target: "repair", sourcePort: "needs_changes" },
    { source: "decision", target: "final-gate", sourcePort: "needs_human" },
  ]);
bugfixGraph.routing!.region = {
  id: "bounded-repair",
  name: "Bounded verified repair",
  entryNodeId: "implement",
  repairEntryNodeId: "repair",
  decisionNodeId: "decision",
  bodyNodeIds: ["implement", "build", "test", "reviewer", "repair", "decision"],
  repairExit: "needs_changes",
  passExit: "pass",
  maxRepairIterations: 2,
  stopOnNoProgress: true,
  sourcePaths: ["source"],
};
const bugfix = portable(
  "Bounded verified bug fix",
  "One declared finite repair region, current native machine evidence, fresh repair sessions and mandatory final approval. Bind real source paths and Build/Test recipes before running.",
  bugfixGraph,
);

const spins = ["normal", "free", "bonus", "respin"];
const slot = portable(
  "Sequential slot refinement",
  "Refine only explicitly selected source-defined behaviors. Require interpretation approval, shared-state review, targeted real tests and final review; no certification or inferred game math.",
  graph(
    "Sequential slot refinement",
    [
      task(
        "analyze",
        "Analyze authoritative game sources",
        "Read the selected authoritative GameDoc, optional math and source references, and the existing engine. Produce source-linked rules, unknowns and affected behavior IDs. Every rule must cite a source reference or be a labelled assumption/question. Do not infer retrigger, max-win or accumulated-win rules from example names. No target or sampling/acceptance rule means no RTP comparison. This workflow is not certification. Do not edit or execute commands.",
        [request],
      ),
      gate("interpretation", "Approve source interpretation and edge cases", "analyze", "final"),
      task(
        "plan",
        "Plan selected tasks and state ownership",
        "Use the approved source interpretation and selected behaviors to plan sequential native implementation. Identify shared-state ownership, exact affected files and targeted edge cases. Explicitly record excluded behaviors and unresolved questions. Preserve source math unless its change was explicitly approved. Do not edit or execute commands.",
        [request, from("analyze")],
      ),
      ...spins.map((id) =>
        task(
          id,
          `Implement ${id[0]!.toUpperCase()}${id.slice(1)}`,
          `Implement only the selected ${id} behavior from the supplied source-linked plan in the chosen existing engine. Read current source first; preserve other behaviors, shared-state ownership and independent tests. A missing rule is a question, not permission to invent one. Native tasks execute sequentially. Do not run Build/Test recipes here.`,
          [request, from("plan")],
        ),
      ),
      task(
        "cross-review",
        "Review cross-spin shared state",
        "Read the actual sequential implementation and supplied authorities. Review shared state across selected behaviors, source-linked edge cases and explicit exclusions. Every finding cites a source reference or is labelled an assumption/question. Do not edit source or claim aggregate RTP establishes rule fidelity. Build/Test follows with the configured real harness.",
        [request, from("plan")],
      ),
      ...tools(),
      reviewer(),
      gate("final-gate", "Final diff, evidence and questions review", "test", "test"),
    ],
    [
      "analyze",
      "interpretation",
      "plan",
      ...spins,
      "cross-review",
      "build",
      "test",
      "reviewer",
      "final-gate",
    ],
  ),
);
slot.parameters.push(
  { id: "targetEngine", label: "Target engine", type: "string", required: true },
  { id: "criteria", label: "Source-linked test criteria", type: "string", required: true },
  ...spins.map((id) => ({ id, label: `Include ${id}`, type: "boolean" as const, required: true })),
  {
    id: "mathTarget",
    label: "Approved math/RTP target (optional)",
    type: "string",
    required: false,
  },
  {
    id: "samplingRule",
    label: "Sampling and acceptance rule (optional)",
    type: "string",
    required: false,
  },
);
slot.references = [
  {
    id: "gameDoc",
    label: "Authoritative GameDoc",
    kind: "document",
    required: true,
    nodeIds: ["analyze"],
  },
  {
    id: "math",
    label: "Authoritative math reference",
    kind: "document",
    required: false,
    nodeIds: ["analyze"],
  },
  {
    id: "source",
    label: "Source reference document",
    kind: "document",
    required: false,
    nodeIds: ["analyze"],
  },
];
slot.optionalNodes = spins.map((id) => ({ nodeId: id, parameterId: id }));

export const builtinTemplates: Array<{ id: string; template: GraphPortableTemplate }> = [
  { id: "generic", template: generic },
  { id: "bugfix", template: bugfix },
  { id: "slot", template: slot },
];
