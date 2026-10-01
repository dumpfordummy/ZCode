import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { desktopProductIdentities } from "../../packages/desktop/scripts/desktop-product-identity.mjs";
import {
  IDENTITY_FILE,
  MANIFEST_FILE,
  buildReleaseManifest,
  readUpstreamReference,
  resolveDistDirName,
  resolvePackagePolicies,
  sha256File,
} from "./release-manifest.mjs";
import { INSPECTION_FILE, inspectPackage } from "./package-inspect.mjs";

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));

const EXPECTED_RESOURCES = [
  "graph-build-identity.json",
  "THIRD-PARTY-NOTICES.md",
  "config/default.json",
  "config/provider/zcode-builtin.json",
  "icon.png",
  "glm/zcode.cjs",
];

/**
 * 从已存在的构建产物重新生成检查报告与外部清单。可以在构建之后用验证结果文件重复运行；
 * 清单只引用产物相对路径。安装包的哈希只出现在这里，绝不写回包内。
 */
export async function finalizeRelease({ root, distName, validationPath }) {
  resolveDistDirName(distName);
  const distDirectory = path.join(root, "packages/desktop", distName);
  const record = await readJson(path.join(distDirectory, "build-record.json"));
  const embedded = await readJson(
    path.join(distDirectory, "win-unpacked/resources", IDENTITY_FILE),
  );
  const exceptions = await readJson(
    path.join(root, "scripts/graph-engineering/package-scan-exceptions.json"),
  );
  const inspectionReport = await inspectPackage({
    root,
    distDirectory,
    version: record.version,
    exceptions: exceptions.exceptions,
    expected: { resources: EXPECTED_RESOURCES, appId: desktopProductIdentities.graph.appId },
  });
  const validation = validationPath ? await readJson(path.resolve(validationPath)) : undefined;
  const policies = await resolvePackagePolicies(root);
  await readUpstreamReference(root);
  const manifest = await buildReleaseManifest({
    root,
    distDirectory,
    distName,
    version: record.version,
    baseVersion: embedded.baseVersion,
    source: { ...record.source, afterBuild: record.sourceAfterBuild },
    toolchain: record.toolchain,
    protocol: embedded.components.protocol,
    policies,
    embedded,
    validation,
    inspection: {
      status: inspectionReport.status,
      report: INSPECTION_FILE,
      unexplainedHits: inspectionReport.scan.unexplained.length,
      explainedHits: inspectionReport.scan.explained,
      note: inspectionReport.scan.note,
    },
  });
  // 一致性：清单、SHA256SUMS 与包内身份必须互相吻合，否则不写清单。
  const sums = (await readFile(path.join(distDirectory, "SHA256SUMS.txt"), "utf8")).trim();
  const problems = [];
  if (sums !== `${manifest.artifact.installer.sha256}  ${manifest.artifact.installer.path}`)
    problems.push("SHA256SUMS.txt does not match the installer hash");
  if (embedded.version !== manifest.version) problems.push("embedded identity version differs");
  if (embedded.source.commit !== manifest.source.commit)
    problems.push("embedded identity commit differs");
  if (manifest.embeddedIdentity.sha256 !== (await sha256File(path.join(distDirectory, "win-unpacked/resources", IDENTITY_FILE))))
    problems.push("embedded identity hash differs");
  if (problems.length) throw new Error(`Release manifest inconsistent: ${problems.join("; ")}`);
  await writeFile(path.join(distDirectory, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const args = process.argv.slice(2);
  const value = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const root = path.resolve(import.meta.dirname, "../..");
  const manifest = await finalizeRelease({
    root,
    distName: resolveDistDirName(value("--dist-dir")),
    validationPath: value("--validation"),
  });
  process.stdout.write(`${MANIFEST_FILE} written for ${manifest.version}\n`);
}
