#!/usr/bin/env node
// CLOUD-BOOTSTRAP-1: graph-cloud-required 的判定逻辑。
// 输入是 workflow 的 `needs` 上下文（JSON）；任何必需 job 缺失、失败、取消或被跳过都判定失败，
// 带测试计数输出的 job 还要核对计数。必需 job 列表是本文件与 workflow `needs:` 的共同契约，
// 两边不一致（多出或缺少）同样失败，防止新增 job 却没有被门禁覆盖。
import { appendFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MANDATORY_JOBS = ["typecheck", "static-checks", "graph-tests"];
/** 这些 job 必须带真实测试计数输出。 */
export const COUNTED_JOBS = ["graph-tests"];

export function evaluateNeeds(needs, mandatory = MANDATORY_JOBS, counted = COUNTED_JOBS) {
  const problems = [];
  if (needs === null || typeof needs !== "object" || Array.isArray(needs)) {
    return ["needs context is not an object"];
  }
  for (const job of mandatory) {
    const entry = needs[job];
    if (!entry) {
      problems.push(`${job}: missing from needs`);
      continue;
    }
    if (entry.result !== "success")
      problems.push(`${job}: result is '${entry.result}', expected 'success'`);
  }
  for (const job of Object.keys(needs)) {
    if (!mandatory.includes(job))
      problems.push(`${job}: unexpected job in needs (not a classified mandatory job)`);
  }
  for (const job of counted) {
    const outputs = needs[job]?.outputs;
    if (!outputs) {
      problems.push(`${job}: no outputs recorded`);
      continue;
    }
    const n = Object.fromEntries(
      ["tests", "pass", "fail", "cancelled", "skipped"].map((key) => [key, Number(outputs[key])]),
    );
    if (outputs.ok !== "true") problems.push(`${job}: ok output is '${outputs.ok}'`);
    if (!Number.isInteger(n.tests) || n.tests <= 0)
      problems.push(`${job}: recorded test count '${outputs.tests}' is not positive`);
    if (n.fail !== 0) problems.push(`${job}: recorded failures '${outputs.fail}'`);
    if (n.cancelled !== 0) problems.push(`${job}: recorded cancelled '${outputs.cancelled}'`);
  }
  return problems;
}

async function main() {
  let needs;
  try {
    needs = JSON.parse(process.env.NEEDS_JSON ?? "");
  } catch (error) {
    console.error(`graph-cloud-required: NEEDS_JSON is not valid JSON (${error.message})`);
    process.exit(1);
  }
  const problems = evaluateNeeds(needs);
  const rows = Object.entries(needs ?? {}).map(([job, e]) => `| ${job} | ${e?.result} |`);
  const summary = [
    "### graph-cloud-required",
    "",
    "| job | result |",
    "|---|---|",
    ...rows,
    "",
    problems.length
      ? `FAILED:\n${problems.map((p) => `- ${p}`).join("\n")}`
      : "All mandatory jobs succeeded.",
    "",
  ].join("\n");
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
  process.exit(problems.length ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
