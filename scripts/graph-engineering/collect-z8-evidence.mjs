import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * 把 Z8.1 的构建与验证证据复制到仓库文档目录（只保留可公开、无本机路径的材料）。
 * 清单、检查报告、比较结果本来就只含产物相对路径；打包运行摘要和遥测对照摘要在这里去掉本机路径。
 * 用法：collect-z8-evidence.mjs <validation-dir> <control-summary.json> [comparison.json] [attempt1-comparison.json]
 */
const root = path.resolve(import.meta.dirname, "../..");
const [validationDirectory, controlSummary, comparison, attemptComparison] = process.argv.slice(2);
if (!validationDirectory || !controlSummary)
  throw new Error(
    "usage: collect-z8-evidence.mjs <validation-dir> <control-summary.json> [comparison.json] [attempt1-comparison.json]",
  );
const target = path.join(root, "docs/graph-engineering/z8/evidence");
await mkdir(target, { recursive: true });
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const write = (name, value) =>
  writeFile(path.join(target, name), `${JSON.stringify(value, null, 2)}\n`);
const scrub = (text) =>
  String(text ?? "")
    .replace(/[A-Za-z]:[\\/][^\s"')]+/g, "<path>")
    .replace(/\s+/g, " ")
    .slice(0, 240);

for (const name of ["b1", "b2"]) {
  const dist = path.join(root, "packages/desktop", `dist-graph-${name}`);
  await copyFile(
    path.join(dist, "RELEASE_MANIFEST.json"),
    path.join(target, `RELEASE_MANIFEST.${name}.json`),
  );
  if (name === "b1") {
    await copyFile(
      path.join(dist, "package-inspection.json"),
      path.join(target, "package-inspection.b1.json"),
    );
    await copyFile(path.join(dist, "SHA256SUMS.txt"), path.join(target, "SHA256SUMS.b1.txt"));
    try {
      const smoke = await readJson(path.join(dist, "packaged-smoke.json"));
      await write("packaged-smoke-summary.b1.json", {
        note: "Sanitized summary of the existing detached packaged smoke run against build b1 (controlled loopback provider, disposable profiles). Local paths removed.",
        version: smoke.version,
        cases: smoke.results.map((r) => ({
          name: r.name,
          status: r.status,
          exitCode: r.exitCode,
          assertions: r.assertions?.length ?? 0,
          packagedIdentity: r.packagedIdentity
            ? {
                name: r.packagedIdentity.name,
                version: r.packagedIdentity.version,
                isPackaged: r.packagedIdentity.isPackaged,
              }
            : undefined,
          telemetryCanary: r.telemetryCanary,
          failure: r.error ? scrub(r.error.split("\n")[0]) : undefined,
        })),
      });
    } catch {
      /* 没有运行打包冒烟 */
    }
  }
}
await copyFile(
  path.join(validationDirectory, "manifest-validation.json"),
  path.join(target, "validation.json"),
);
await copyFile(
  path.join(validationDirectory, "validation-attempts.json"),
  path.join(target, "validation-attempts.json"),
);
const control = await readJson(controlSummary);
await write("telemetry-control.dev.json", {
  note: "Positive control: ordinary (non-Graph) flavor development build with inherited telemetry variables pointing at loopback canary paths. It must receive hits, otherwise the canary method is not proven.",
  mode: control.mode,
  status: control.status,
  telemetryCanary: control.telemetryCanary,
});
if (comparison) await copyFile(comparison, path.join(target, "build-comparison.json"));
if (attemptComparison)
  await copyFile(attemptComparison, path.join(target, "build-comparison.attempt1.json"));
