import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const root = path.resolve(import.meta.dirname, "../..");
const output = path.join(root, "packages/desktop/dist-graph");
const detached = await mkdtemp(path.join(tmpdir(), "zcode-graph-package-"));
await cp(path.join(output, "win-unpacked"), detached, { recursive: true });
const results = [];
for (const args of [
  [],
  ["--no-provider"],
  ["--question"],
  ["--cancel"],
  ["--restart-interrupted"],
]) {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(import.meta.dirname, "native-smoke.mjs"), ...args],
      {
        cwd: detached,
        env: { ...process.env, Z1_PACKAGED_EXE: path.join(detached, "ZCode Graph.exe") },
        windowsHide: true,
        stdio: ["ignore", "pipe", "inherit"],
      },
    );
    let stdout = "";
    child.stdout.on("data", (data) => {
      stdout += data;
      process.stdout.write(data);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0)
        return reject(new Error(`Packaged smoke exited ${code}; detached app: ${detached}`));
      resolve(JSON.parse(stdout));
    });
  });
  results.push(result);
  const evidence = path.join(output, "smoke-evidence", `${result.mode}-${result.scenario}`);
  await mkdir(evidence, { recursive: true });
  for (const file of result.screenshots) await cp(file, path.join(evidence, path.basename(file)));
  await writeFile(
    path.join(evidence, "summary.json"),
    await readFile(path.join(result.home, "summary.json")),
  );
}
await writeFile(
  path.join(output, "packaged-smoke.json"),
  JSON.stringify({ detached, results }, null, 2),
);
process.stdout.write(`Packaged acceptance PASS; evidence: ${output}\n`);
