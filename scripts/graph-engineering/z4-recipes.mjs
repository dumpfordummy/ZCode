import { REQUIRED_TESTS } from "./z4-csharp-source.mjs";
import { BUILD_ARGS, BUILD_PATHS, SOURCE_PATHS, TEST_ARGS } from "./z4-fixture.mjs";

export const OUTPUT_SCHEMA = {
  type: "object",
  required: ["outcome", "summary", "findings"],
  additionalProperties: false,
  properties: {
    outcome: { type: "string", enum: ["pass", "needs_changes", "needs_human"] },
    summary: { type: "string", minLength: 1, maxLength: 2000 },
    findings: { type: "array", items: { type: "string" }, maxItems: 10 },
  },
};
export const REPORT_PATH = "results/test-report.json";
export function fixtureRecipes(buildNodeId, scenario = "complete") {
  const extra =
    scenario === "zero"
      ? ["--zero"]
      : ["missing", "stale"].includes(scenario)
        ? ["--omit-report"]
        : ["cancel", "crash", "lost-ack"].includes(scenario)
          ? ["--hold", "--ready-file", "results/native-ready.json"]
          : scenario === "redaction"
            ? ["--emit-synthetic-secret"]
            : [];
  return [
    {
      id: "fixture-build",
      name: "Build C# fixture",
      executable: "dotnet",
      args: BUILD_ARGS,
      cwd: ".",
      timeoutMs: 60000,
      sourcePaths: SOURCE_PATHS,
      expectedOutputs: BUILD_PATHS,
      verifier: { kind: "build" },
    },
    {
      id: "fixture-test",
      name: "Test C# fixture",
      executable: "dotnet",
      args: [...TEST_ARGS, ...extra],
      cwd: ".",
      timeoutMs: 60000,
      sourcePaths: SOURCE_PATHS,
      expectedOutputs: [],
      ...(scenario === "redaction" ? { redactEnvironmentVariables: ["Z4_FIXTURE_SECRET"] } : {}),
      verifier: {
        kind: "test",
        format: "zcode-json-v1",
        reportPath: REPORT_PATH,
        minimumTests: 3,
        expectedTests: 3,
        requiredTests: REQUIRED_TESTS,
        buildNodeId,
      },
    },
  ];
}
