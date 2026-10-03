// Z8.3-W1 orchestrator. Never patches the retained package: it verifies the retained win-unpacked against its manifest,
// runs every case from one hash-verified detached copy, re-verifies the retained package afterwards, and keeps the raw
// result of each case (exit code included) under <dist>/w1-evidence/<attempt>/.
// usage: w1-suite.mjs <version> --dist-dir dist-graph-w1 [--only=a,b] [--label=attempt-name]
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveDistDirName, sha256File } from "./release-manifest.mjs";
import { verifyPackageHashes } from "./verify-package-hashes.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2);
const version = args[0];
const option = (name) => args.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
const distName = resolveDistDirName(
  args.includes("--dist-dir") ? args[args.indexOf("--dist-dir") + 1] : undefined,
);
if (!version)
  throw new Error("usage: w1-suite.mjs <version> --dist-dir <name> [--only=a,b] [--label=name]");
const dist = path.join(root, "packages/desktop", distName);
const label = option("label") ?? new Date().toISOString().replace(/[:.]/g, "-");
const evidence = path.join(dist, "w1-evidence", label);
await mkdir(evidence, { recursive: true });

const CASES = [
  { name: "tool-only-support", script: "w1-native.mjs", args: ["--case=tool-only-support"] },
  // Host-side TypeScript from source (tsx) against the REAL bundled agent of the detached package; see w1-admission.ts.
  { name: "admission-record", script: "w1-admission.ts", args: ["--mode=record"], tsx: true },
  {
    name: "admission-negative-strip-contract",
    script: "w1-admission.ts",
    args: ["--mode=strip-contract"],
    tsx: true,
  },
  {
    name: "admission-negative-wrong-wire",
    script: "w1-admission.ts",
    args: ["--mode=wrong-wire"],
    tsx: true,
  },
  {
    name: "admission-negative-method-missing",
    script: "w1-admission.ts",
    args: ["--mode=method-missing"],
    tsx: true,
  },
  // The legacy native-smoke.mjs graph mode predates the UX-M1..M4 screens (its first run on candidate 1 stopped at a
  // hidden effective-model element: kept in attempt c1-attempt1). z2 "complete" is the maintained packaged driver for
  // a small normal Graph workflow against the loopback model fixture.
  {
    name: "normal-graph-loopback-model",
    script: "z2-native-smoke.mjs",
    args: ["--scenario=complete"],
  },
  { name: "n1-network-wiring", script: "w1-native.mjs", args: ["--case=n1"] },
  // Same case with a 70 s idle window so the 60 s background timers are inside the observation.
  {
    name: "n1-network-wiring-70s-idle",
    script: "w1-native.mjs",
    args: ["--case=n1", "--idle-seconds=70"],
  },
];
const only = option("only")?.split(",");
const selected = only ? CASES.filter((item) => only.includes(item.name)) : CASES;

const before = await verifyPackageHashes(dist);
await writeFile(
  path.join(evidence, "retained-hash-check.before.json"),
  `${JSON.stringify(before, null, 2)}\n`,
);
if (!before.ok)
  throw new Error("The retained package differs from its manifest; refusing to test it.");

const COMPONENTS = [
  "ZCode Graph.exe",
  "resources/app.asar",
  "resources/glm/zcode.cjs",
  "resources/graph-build-identity.json",
];
const source = path.join(dist, "win-unpacked");
const expected = {};
for (const name of COMPONENTS)
  expected[name] = await sha256File(path.join(source, ...name.split("/")));
const detached = await mkdtemp(path.join(tmpdir(), "zcode-graph-w1-"));
await cp(source, detached, { recursive: true });
for (const name of COMPONENTS)
  if ((await sha256File(path.join(detached, ...name.split("/")))) !== expected[name])
    throw new Error(`Detached copy differs from the retained package: ${name}`);
await writeFile(
  path.join(evidence, "detached-component-hashes.json"),
  `${JSON.stringify({ expected, detachedVerified: true }, null, 2)}\n`,
);

const run = (command, commandArgs, env, cwd) =>
  new Promise((resolve) => {
    const child = spawn(command, commandArgs, {
      cwd,
      env: { ...process.env, ...env },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => (stdout += data));
    child.stderr.on("data", (data) => (stderr += data));
    child.on("error", (error) =>
      resolve({ exitCode: null, stdout, stderr: `${stderr}${error.message}` }),
    );
    child.on("close", (code) => resolve({ exitCode: code, stdout, stderr }));
  });

const inspect = async (name, dir) => {
  const output = path.join(evidence, `inspect-${name}.json`);
  const result = await run(
    process.execPath,
    [path.join(import.meta.dirname, "w1-inspect.mjs"), dir, output],
    {},
    root,
  );
  return { name, exitCode: result.exitCode };
};
const results = [await inspect("retained", source), await inspect("detached", detached)];

for (const item of selected) {
  const result = await run(
    process.execPath,
    [
      ...(item.tsx ? ["--import", "tsx"] : []),
      path.join(import.meta.dirname, item.script),
      ...item.args,
    ],
    { Z1_PACKAGED_EXE: path.join(detached, "ZCode Graph.exe") },
    item.tsx ? root : detached,
  );
  let summary;
  try {
    summary = JSON.parse(result.stdout);
  } catch {
    summary = { status: "FAIL", error: "no valid summary on stdout" };
  }
  await writeFile(
    path.join(evidence, `${item.name}.summary.json`),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  await writeFile(path.join(evidence, `${item.name}.stderr.log`), result.stderr);
  results.push({
    name: item.name,
    exitCode: result.exitCode,
    status: summary.status,
    home: summary.home,
  });
  process.stdout.write(`${item.name}: exit ${result.exitCode} ${summary.status}\n`);
}

const after = await verifyPackageHashes(dist);
await writeFile(
  path.join(evidence, "retained-hash-check.after.json"),
  `${JSON.stringify(after, null, 2)}\n`,
);
const index = {
  version,
  distName,
  label,
  detachedDirectory: detached,
  retainedUnchanged:
    before.ok && after.ok && JSON.stringify(before.observed) === JSON.stringify(after.observed),
  results,
};
await writeFile(path.join(evidence, "suite.json"), `${JSON.stringify(index, null, 2)}\n`);
process.stdout.write(
  `W1 suite done; retained package unchanged: ${index.retainedUnchanged}; evidence ${evidence}\n`,
);
process.exitCode = results.every((item) => item.exitCode === 0) && index.retainedUnchanged ? 0 : 1;
