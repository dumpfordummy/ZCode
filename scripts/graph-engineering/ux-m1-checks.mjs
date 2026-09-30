// Saved checks used by the UX-M1.2 scenarios. They are written into the real `.zcode/config.json` of a
// temporary workspace and read back by the real recipe store (schema validation included).
const base = {
  executable: "dotnet",
  args: ["--version"],
  cwd: ".",
  timeoutMs: 1000,
  sourcePaths: ["src/main.cs"],
  expectedOutputs: [],
};
// 真实的检查 schema：Build/Test 必须声明源文件，Build 还必须声明预期产物。
export const BUILD = {
  ...base,
  id: "build-main",
  name: "Compile solution",
  expectedOutputs: ["out/app.dll"],
  verifier: { kind: "build" },
};
export const BUILD_ALT = {
  ...base,
  id: "build-alt",
  name: "Compile (alternate)",
  expectedOutputs: ["out/app.dll"],
  verifier: { kind: "build" },
};
const testVerifier = {
  kind: "test",
  format: "zcode-json-v1",
  reportPath: "report.json",
  minimumTests: 1,
  requiredTests: [],
  buildNodeId: "build",
};
export const TEST = { ...base, id: "test-unit", name: "Unit tests", verifier: testVerifier };
export const TEST_EXTRA = {
  ...base,
  id: "test-extra",
  name: "Integration tests",
  verifier: testVerifier,
};
export const LINT = {
  ...base,
  sourcePaths: [],
  id: "lint",
  name: "Lint only",
  verifier: { kind: "command" },
};
export const ALL_CHECKS = [BUILD, BUILD_ALT, TEST, TEST_EXTRA, LINT];
/** The same id, still saved, but no longer able to serve a Build step. */
export const BUILD_AS_COMMAND = { ...BUILD, verifier: { kind: "command" } };
