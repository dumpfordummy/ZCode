import { z } from "zod";
import { parseBoundedGraphJson } from "./artifacts.js";

const reportSchema = z
  .object({
    format: z.literal("zcode-test-v1"),
    operationId: z.string().min(1),
    sourceDigest: z.string().min(1),
    buildDigest: z.string().min(1),
    tests: z
      .array(
        z
          .object({
            name: z.string().min(1).max(200),
            status: z.enum(["passed", "failed", "skipped"]),
            message: z.string().max(2000).optional(),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict();
export function verifyToolReport(
  text: string,
  expected: {
    operationId: string;
    sourceDigest: string;
    buildDigest: string;
    minimumTests: number;
    expectedTests?: number;
    requiredTests: string[];
  },
) {
  const result = {
    reportParsed: false,
    provenanceValid: false,
    outcome: "invalid" as "pass" | "fail" | "invalid",
    tests: [] as Array<{ name: string; status: "passed" | "failed" | "skipped"; message?: string }>,
    testCount: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    issues: [] as string[],
  };
  try {
    const report = reportSchema.parse(parseBoundedGraphJson(text));
    result.reportParsed = true;
    result.tests = report.tests;
    result.testCount = report.tests.length;
    for (const test of report.tests) result[test.status]++;
    for (const key of ["operationId", "sourceDigest", "buildDigest"] as const)
      if (report[key] !== expected[key])
        result.issues.push(`Report ${key} does not match this exact invocation.`);
    if (new Set(report.tests.map((t) => t.name)).size !== report.tests.length)
      result.issues.push("Duplicate test identities are invalid.");
    if (
      !result.testCount ||
      result.testCount < expected.minimumTests ||
      (expected.expectedTests !== undefined && result.testCount !== expected.expectedTests)
    )
      result.issues.push("Discovered tests do not match the configured positive count.");
    // 结构及来源有效与验收通过必须分开；真实失败断言可供修复，但缺失/跳过/伪造报告不可触发重试。
    result.provenanceValid =
      result.issues.length === 0 &&
      expected.requiredTests.every((name) =>
        report.tests.some((t) => t.name === name && t.status !== "skipped"),
      ) &&
      result.passed + result.failed > 0;
    if (result.failed) result.issues.push("The native test report contains failures.");
    // 发现但全部跳过并不证明任何测试执行成功，不能显示 Tests passed。
    if (!result.passed)
      result.issues.push("No executed test passed; all-skipped reports cannot pass.");
    for (const name of expected.requiredTests)
      if (!report.tests.some((t) => t.name === name && t.status === "passed"))
        result.issues.push(`Required test ${name} is missing, failed or skipped.`);
    if (result.provenanceValid)
      result.outcome = result.failed ? "fail" : result.issues.length ? "invalid" : "pass";
  } catch (error) {
    result.issues.push(error instanceof Error ? error.message : "Invalid strict test report.");
  }
  return result;
}
