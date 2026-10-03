// Z8.3-W1 A-1/A-2: read-only inspection of a packaged win-unpacked directory using the Z8.3-A module itself.
// usage: w1-inspect.mjs <win-unpacked dir> [output.json]
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const root = path.resolve(import.meta.dirname, "../..");
const [unpacked, output] = process.argv.slice(2);
if (!unpacked) throw new Error("usage: w1-inspect.mjs <win-unpacked dir> [output.json]");
const integrity = await import(
  pathToFileURL(path.join(root, "packages/desktop/scripts/windows-asar-integrity.mjs")).href
);
const sha256 = async (file) => createHash("sha256").update(await readFile(file)).digest("hex");
const exePath = path.join(unpacked, "ZCode Graph.exe");
const result = { directory: "<win-unpacked>", checkedAt: new Date().toISOString() };
try {
  // requireFuse: the recorded header hash must equal the archive's header hash AND the integrity fuse must be on.
  const asserted = await integrity.assertWindowsAsarIntegrity({ exePath, appOutDir: unpacked, requireFuse: true });
  result.records = asserted.records;
  result.fuses = asserted.fuses.byName;
  result.fuseWireVersion = asserted.fuses.version;
  result.recordMatchesHeader = asserted.records.every((record) => record.recorded === record.actual);
  result.integrityFuseOn = asserted.fuses.byName.EnableEmbeddedAsarIntegrityValidation === "1";
  result.runAsNodeState = asserted.fuses.byName.RunAsNode;
  result.status = "PASS";
} catch (error) {
  result.status = "FAIL";
  result.error = { code: error.code, message: String(error.message).slice(0, 300) };
  process.exitCode = 1;
}
const components = {
  "ZCode Graph.exe": exePath,
  "resources/app.asar": path.join(unpacked, "resources", "app.asar"),
  "resources/glm/zcode.cjs": path.join(unpacked, "resources", "glm", "zcode.cjs"),
  "resources/graph-build-identity.json": path.join(unpacked, "resources", "graph-build-identity.json"),
};
result.components = {};
for (const [name, file] of Object.entries(components)) result.components[name] = await sha256(file);
const text = `${JSON.stringify(result, null, 2)}\n`;
if (output) await writeFile(output, text);
process.stdout.write(text);
