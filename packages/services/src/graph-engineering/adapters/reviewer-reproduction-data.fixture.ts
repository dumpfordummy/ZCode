import { createHash } from "node:crypto";
import { builtinTemplates } from "../domain/workflow-samples.js";
import { instantiateTemplate } from "../domain/workflow.js";
import { runFingerprint } from "../app/attempts.js";
import type { GraphRecipe, GraphSequentialDefinition } from "../contract.js";

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export const BUILTIN_TEMPLATE_VERSION = 2;
export const RUN_REQUEST = "Modify zz-demo.txt file content to after";

// ─── Fixture scripts (written into the temp workspace) ─────────────────────

export const BUILD_JS = `\
// build.js — produces a declared output file within the operation window.
const fs = require("fs");
const operationId = process.argv[2] || "";
const sourceDigest = process.argv[3] || "";
fs.writeFileSync("build.out", operationId + ":" + sourceDigest + "\\n");
process.exit(0);
`;

export const TEST_JS = `\
// test.js — reads zz-demo.txt, evaluates assertion, writes zcode-test-v1 report.
const fs = require("fs");
const operationId = process.argv[2] || "";
const sourceDigest = process.argv[3] || "";
const buildDigest = process.argv[4] || "";
const reportPath = process.argv[5] || "report.json";
const content = fs.readFileSync("zz-demo.txt", "utf8");
const passed = content.includes("after");
const report = {
  format: "zcode-test-v1",
  operationId: operationId,
  sourceDigest: sourceDigest,
  buildDigest: buildDigest,
  tests: [
    {
      name: "contains-after",
      status: passed ? "passed" : "failed",
      message: passed
        ? "zz-demo.txt contains 'after'"
        : "zz-demo.txt does not contain 'after'; content: " + content.trim(),
    },
  ],
};
fs.writeFileSync(reportPath, JSON.stringify(report));
process.exit(passed ? 0 : 1);
`;

// ─── Recipe declarations ────────────────────────────────────────────────────

export function nodeRecipes(): GraphRecipe[] {
  return [
    {
      id: "build",
      name: "Node build",
      executable: "node",
      args: ["build.js", "{operationId}", "{sourceDigest}"],
      cwd: ".",
      timeoutMs: 30000,
      sourcePaths: ["zz-demo.txt"],
      expectedOutputs: ["build.out"],
      verifier: { kind: "build" },
    },
    {
      id: "test",
      name: "Node test",
      executable: "node",
      args: ["test.js", "{operationId}", "{sourceDigest}", "{buildDigest}", "{reportPath}"],
      cwd: ".",
      timeoutMs: 30000,
      sourcePaths: ["zz-demo.txt"],
      expectedOutputs: [],
      verifier: {
        kind: "test",
        format: "zcode-json-v1",
        reportPath: "report.json",
        minimumTests: 1,
        expectedTests: 1,
        requiredTests: ["contains-after"],
        buildNodeId: "build",
      },
    },
  ];
}

// ─── Instantiate the built-in generic template ──────────────────────────────

export function instantiateGeneric(request: string): GraphSequentialDefinition {
  const entry = builtinTemplates.find((e) => e.id === "generic")!;
  const selected = {
    version: BUILTIN_TEMPLATE_VERSION,
    digest: sha256(runFingerprint(entry.template)),
    createdAt: 0,
    template: structuredClone(entry.template),
  };
  return instantiateTemplate(
    "generic",
    selected,
    { request },
    {
      references: {},
      recipes: { build: "build", test: "test" },
      sourcePaths: [],
    },
  );
}
