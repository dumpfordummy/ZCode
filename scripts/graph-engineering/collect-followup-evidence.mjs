import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { reconcileComparison } from "./reconcile-comparison.mjs";

/**
 * 把 Z8.1 打包后续的证据复制到文档目录（无本机路径）：
 * 验证补充与前后哈希核对、被保留的先前尝试（含原先 2 通过/10 失败）、保留比较数据的账目、
 * ASAR 完整性直接读数，以及每条遥测路径的对照运行记录。
 * 用法：collect-followup-evidence.mjs <dist-dir-name> <asar-integrity.json> [scratch-native-profiles-dir]
 */
const root = path.resolve(import.meta.dirname, "../..");
const [distName, integrityFile, profilesDirectory] = process.argv.slice(2);
if (!distName || !integrityFile)
  throw new Error(
    "usage: collect-followup-evidence.mjs <dist-dir-name> <asar-integrity.json> [.tmp dir]",
  );
const dist = path.join(root, "packages/desktop", distName);
const target = path.join(root, "docs/graph-engineering/z8/evidence/packaged-followup");
await mkdir(target, { recursive: true });
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const write = (name, value) =>
  writeFile(path.join(target, name), `${JSON.stringify(value, null, 2)}\n`);
const scrub = (text) =>
  String(text ?? "")
    .replace(/[A-Za-z]:[\\/][^\s"')]+/g, "<path>")
    .replace(/\s+/g, " ")
    .slice(0, 240);

for (const name of [
  "PACKAGED_VALIDATION_SUPPLEMENT.json",
  "packaged-hash-check.before.json",
  "packaged-hash-check.after.json",
])
  await copyFile(path.join(dist, name), path.join(target, name));

// 保留的先前尝试：逐个摘要（用例、退出码、状态、首行失败原因），不含本机路径。
const attempts = [];
const history = path.join(dist, "packaged-smoke-history");
for (const entry of (await readdir(history)).sort()) {
  let smoke;
  try {
    smoke = await readJson(path.join(history, entry, "packaged-smoke.json"));
  } catch {
    continue;
  }
  attempts.push({
    attempt: entry,
    scope: smoke.scope ?? "full (written before scope labels existed)",
    harnessCommit:
      smoke.harness?.commit ?? "not recorded (written before harness provenance existed)",
    cases: smoke.results.map((r) => ({
      name: r.name,
      status: r.status,
      exitCode: r.exitCode,
      assertions: r.assertions?.length ?? 0,
      failure: r.error ? scrub(String(r.error).split("\n")[0]) : undefined,
    })),
  });
}
await write("retained-attempts.json", {
  note: "Every earlier packaged run against this same binary, oldest first. The first is the original 2-PASS/10-FAIL run: blocked at stale harness navigation; downstream behavior was not exercised.",
  attempts,
});

// 保留比较数据的账目（不重新比较任何构建）。
const comparison = await readJson(
  path.join(root, "docs/graph-engineering/z8/evidence/build-comparison.json"),
);
await write("build-comparison.accounting.json", reconcileComparison(comparison));
await copyFile(integrityFile, path.join(target, "asar-integrity.json"));

// 遥测对照运行：每条路径的实际命中情况（含失败与未复现的）。
if (profilesDirectory) {
  const runs = [];
  for (const name of (await readdir(profilesDirectory))
    .filter((n) => n.startsWith("z1-native-"))
    .sort()) {
    let summary;
    try {
      summary = await readJson(path.join(profilesDirectory, name, "summary.json"));
    } catch {
      continue;
    }
    const canary = summary.telemetryCanary;
    if (!canary || canary.kind !== "positive-control") continue;
    runs.push({
      run: name.replace(/^z1-native-/, ""),
      status: summary.status,
      endpointsConfigured: canary.endpointsConfigured,
      hits: canary.hits,
      hitPaths: canary.hitPaths,
      armsInitAttempted: canary.armsInitAttempted,
      failure: summary.error ? scrub(String(summary.error).split("\n")[0]) : undefined,
    });
  }
  await write("telemetry-positive-controls.json", {
    note: "All positive-control runs of the ordinary (non-Graph) flavor development build, oldest first, with the canary paths that actually received requests. Runs are listed regardless of outcome.",
    runs,
  });
}

// 能力 → 打包用例的覆盖映射（由补充文件的实际结果推导，不手写 PASS）。
// 一个能力只有在映射到的全部用例都通过时才算打包验证；这不是对用例没覆盖的部分的任何声明。
const supplement = await readJson(path.join(dist, "PACKAGED_VALIDATION_SUPPLEMENT.json"));
const status = new Map(supplement.packagedSmoke.cases.map((c) => [c.name, c.status]));
const MAPPING = {
  "ordinary-chat": ["ordinary-chat"],
  "startup-without-provider-no-model-request": ["no-provider"],
  "sequential-graph-legacy-compatibility": ["z1-literal-compatibility"],
  "sequential-graph-multi-session-handoff": ["z2-complete", "z2-question"],
  "cancellation-preserves-unrelated-chat": [
    "z2-cancel-question",
    "z2-cancel-permission",
    "z2-cancel-progress",
  ],
  "restart-and-conservative-recovery": [
    "z2-restart-interrupted",
    "z2-restart-permission",
    "z2-persistence-recovery",
  ],
  "built-in-sequential-engineering-template-instantiation": ["sequential-engineering-reviewer"],
  "build-test-checks-through-native-runtime": ["sequential-engineering-reviewer"],
  "strict-reviewer-output-bound-to-verification-artifact": ["sequential-engineering-reviewer"],
  "final-human-gate-presented-and-left-pending": ["sequential-engineering-reviewer"],
  "automatic-telemetry-inherited-settings-three-paths": ["telemetry-canary"],
};
await write("capability-coverage.json", {
  note:
    "Derived from PACKAGED_VALIDATION_SUPPLEMENT.json for build-source " +
    supplement.buildSource.commit +
    ". A capability is packaged-verified only if every mapped case passed.",
  capabilities: Object.entries(MAPPING).map(([capability, cases]) => ({
    capability,
    cases,
    packagedVerified: cases.every((name) => status.get(name) === "PASS"),
  })),
  notExercisedInPackage: [
    "final-gate approve/reject decisions and approval-evidence freshness (Z3)",
    "bounded repair routing and NeedsHuman stops (Z5)",
    "workflow library save/version/archive, portable import/export, historical pins (Z6, UX-M3)",
    "Build/Test failure paths (a genuine failing Test) and reviewer negative outputs",
    "Fork/Join parallel (disabled by policy; Host rejection is unit-tested, not packaged-tested)",
    "installer install/upgrade/uninstall, upgrade over older profiles, signing",
    "production-environment network egress; Feedback uploader",
  ],
});
