import assert from "node:assert/strict";
import { copyFile, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { root } from "./isolation.mjs";

const logDirectory = path.join(root, ".tmp/z6-baseline");
const destination = path.join(root, "docs/graph-engineering/evidence/z6/native");
const index = [];
function sanitize(value, home) {
  if (typeof value === "string") {
    for (const [base, label] of [
      [home, "<isolated-profile>"],
      [root, "<checkout>"],
    ]) {
      for (const width of [8, 4, 2, 1])
        value = value.replaceAll(base.replaceAll("\\", "\\".repeat(width)), label);
      value = value.replaceAll(base.replaceAll("\\", "/"), label);
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => sanitize(item, home));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitize(item, home)]),
    );
  return value;
}
async function contained(home, file) {
  const resolved = await realpath(file);
  assert.ok(
    resolved.startsWith(`${home}${path.sep}`),
    "Evidence must stay in the exact synthetic profile.",
  );
  return resolved;
}
for (const name of (await readdir(logDirectory))
  .filter((name) => name.startsWith("native-z6-") && name.endsWith(".log"))
  .sort()) {
  const log = await readFile(path.join(logDirectory, name), "utf8");
  const at = log.search(/\{\r?\n  "scenario"/);
  if (at === -1) {
    index.push({ log: name, status: "NO_SUMMARY" });
    continue;
  }
  const summary = JSON.parse(log.slice(at));
  const home = await realpath(summary.home);
  assert.equal(path.dirname(home), path.join(root, ".tmp"));
  assert.match(path.basename(home), /^z1-native-\d+-[a-f0-9]{6}$/);
  const directory = name.slice("native-z6-".length, -4),
    target = path.join(destination, directory);
  await mkdir(target, { recursive: true });
  const requests = JSON.parse(
    await readFile(await contained(home, path.join(home, "requests.json")), "utf8"),
  ).filter((item) => item.model);
  summary.requestCounts = {
    total: requests.length,
    execution: requests.filter((item) => item.native === true).length,
    auxiliary: requests.filter((item) => item.native === false).length,
  };
  assert.equal(summary.modelRequests, requests.length);
  await writeFile(
    path.join(target, "summary.json"),
    JSON.stringify(sanitize(summary, home), null, 2) + "\n",
  );
  await writeFile(
    path.join(target, "controlled-model-requests.json"),
    JSON.stringify(sanitize(requests, home), null, 2) + "\n",
  );
  const files = ["summary.json", "controlled-model-requests.json"];
  for (const screenshot of summary.screenshots ?? []) {
    const source = await contained(home, screenshot),
      file = path.basename(source);
    await copyFile(source, path.join(target, file));
    files.push(file);
  }
  for (const evidence of summary.iterationEvidence ?? [])
    for (const kind of ["report", "verification"]) {
      const file = `iteration-${evidence.iteration.index}-${kind}.json.txt`;
      await writeFile(path.join(target, file), evidence[kind].content);
      files.push(file);
    }
  if (summary.status === "PASS" && ["generic", "bugfix", "slot"].includes(summary.scenario)) {
    for (const file of summary.scenario === "slot"
      ? ["SlotRules.cs", "GameDoc.md", "Runner.cs", "Z6Slot.csproj"]
      : ["MathOps.cs", "Runner.cs", "Z4Fixture.csproj"]) {
      await copyFile(
        await contained(home, path.join(home, "workspace", file)),
        path.join(target, `${file}.txt`),
      );
      files.push(`${file}.txt`);
    }
  }
  const run = summary.finalRecord?.runs.at(-1);
  index.push({
    scenario: summary.scenario,
    status: summary.status,
    log: name,
    directory,
    nativeInputs: summary.nativeLedger?.length,
    nativeProcesses: run?.toolAttempts.filter((item) => item.operation?.processStarted).length ?? 0,
    iterations: run?.routing.iterations.length ?? 0,
    requests: summary.requestCounts,
    files,
  });
}
await mkdir(destination, { recursive: true });
await writeFile(
  path.join(destination, "index.json"),
  JSON.stringify(
    {
      status: "Evidence index; failures retained separately from successful reruns",
      userOperatedChecks: "NOT RUN",
      scenarios: index,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify(
    index.map(({ files: _files, ...item }) => item),
    null,
    2,
  ),
);
