import assert from "node:assert/strict";
import { readFile, writeFile, readdir, mkdir, cp, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createGraphRecipeStore } from "../../packages/services/src/graph-engineering/adapters/recipes.ts";
import { prepareWebProfileInputs } from "../../packages/services/src/graph-engineering/adapters/web-profile-inputs.ts";
import {
  captureWebProfileRuntime,
  revalidateWebProfileRuntime,
} from "../../packages/shared/src/node/webProfileProvenance.ts";
import policy from "../../packages/shared/src/web-profile-policy.json" with { type: "json" };
const home = process.env.F1_WEB_NATIVE_HOME;
assert.ok(home, "Explicit completed synthetic native fixture required");
const native = JSON.parse(await readFile(path.join(home, "f1-web-native-summary.json"), "utf8"));
assert.equal(native.status, "PASS");
const workspace = path.join(home, "workspace"),
  directory = path.join(home, "data/.zcode/v2/graph-engineering");
const proofRoot = path.join(directory, "graph-web-profile-v1");
const partition = (await readdir(proofRoot))[0],
  file = (await readdir(path.join(proofRoot, partition)))[0];
const proof = JSON.parse(await readFile(path.join(proofRoot, partition, file), "utf8"));
const target = { workspacePath: workspace, workspaceIdentity: proof.workspace };
const store = createGraphRecipeStore(directory),
  configured = await store.read(target),
  scope = configured.recipes[0].sourceScope;
const paths = configured.recipes[0].sourcePaths;
const summary = {
  kind: "native-fixture freshness owner probes; no new execution",
  status: "RUNNING",
  cases: [],
  sourceCount: scope.sourceCount,
};
const started = performance.now();
const mark = (name, detail = {}) => {
  const row = { name, ...detail, elapsedMs: performance.now() - started };
  summary.cases.push(row);
  console.error(JSON.stringify(row));
};
const sha = (b) => createHash("sha256").update(b).digest("hex");
const fingerprint = () => store.fingerprint(target, paths, [scope]);
const baseline = await fingerprint();
mark("saved native profile fresh", { digest: baseline.digest });
async function stale(name) {
  try {
    const fresh = await fingerprint();
    assert.notEqual(fresh.digest, baseline.digest, name);
    mark(name, { outcome: "changed byte digest" });
  } catch (e) {
    if (e.code === "ERR_ASSERTION") throw e;
    mark(name, { outcome: "rejected", reason: e.message });
  }
}
async function mutate(relative, change, name) {
  const file = path.join(workspace, relative),
    original = await readFile(file);
  try {
    await writeFile(file, change(original));
    await stale(name);
  } finally {
    await writeFile(file, original);
    assert.equal(sha(await readFile(file)), sha(original));
  }
}
try {
  const membership = await prepareWebProfileInputs(target, {
    webProject: scope.webProject,
    testProject: scope.project,
    configuration: scope.configuration,
  });
  assert.ok(membership.sourcePaths.indexOf("Web/Source39.cs") > 32);
  await mutate(
    "Web/Source39.cs",
    (b) => Buffer.concat([b, Buffer.from("\n// changed after review")]),
    "source beyond first 32",
  );
  await mutate(
    "Web/appsettings.json",
    (b) => b.toString().replace("web-config", "changed-config"),
    "implicit copied JSON",
  );
  await mutate(
    "Web/wwwroot/site.txt",
    (b) => Buffer.concat([b, Buffer.from(" changed")]),
    "implicit static Content",
  );
  await mutate(
    "Directory.Build.props",
    (b) =>
      b
        .toString()
        .replace(
          "</Project>",
          "<PropertyGroup><Nullable>enable</Nullable></PropertyGroup></Project>",
        ),
    "applicable import",
  );
  await mutate(
    "global.json",
    (b) => b.toString().replace("8.0.426", "10.0.401"),
    "effective SDK configuration",
  );
  const addition = path.join(workspace, "Web/wwwroot/future-input.txt"),
    renamed = path.join(workspace, "Web/wwwroot/future-renamed.txt");
  await writeFile(addition, "future");
  try {
    await stale("future glob addition");
    await rename(addition, renamed);
    await stale("future glob rename");
  } finally {
    await unlink(renamed).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
    await unlink(addition).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
  }
  const removed = path.join(workspace, "Web/Source39.cs"),
    removedBytes = await readFile(removed);
  await unlink(removed);
  try {
    await stale("source removal");
  } finally {
    await writeFile(removed, removedBytes);
  }
  assert.equal((await fingerprint()).digest, baseline.digest);
  mark("exact workspace restoration", { digest: baseline.digest });
  // Never mutate the installed SDK or retained shared public cache. Copy only the already reviewed exact roots.
  const copyRoot = path.join(home, "freshness-toolchain-copy"),
    dotnet = path.join(copyRoot, "dotnet"),
    packages = path.join(copyRoot, "packages");
  await mkdir(dotnet, { recursive: true });
  await mkdir(packages, { recursive: true });
  for (const entry of policy.roots) {
    const destination = path.join(dotnet, entry.relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(
      path.join(path.dirname(scope.runtimeProfile.executable), entry.relativePath),
      destination,
      { recursive: true, errorOnExist: true, force: false },
    );
  }
  for (const entry of policy.packages) {
    const destination = path.join(packages, entry.path);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(scope.runtimeProfile.packageRoot, entry.path), destination, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
  }
  for (const parent of [
    "host/fxr",
    "shared/Microsoft.NETCore.App",
    "shared/Microsoft.AspNetCore.App",
    "packs/Microsoft.NETCore.App.Ref",
    "packs/Microsoft.AspNetCore.App.Ref",
    "packs/Microsoft.NETCore.App.Host.win-x64",
  ]) {
    for (const name of await readdir(
      path.join(path.dirname(scope.runtimeProfile.executable), parent),
    ))
      await mkdir(path.join(dotnet, parent, name), { recursive: true });
  }
  const input = {
    workspace,
    executable: path.join(dotnet, "dotnet.exe"),
    packageRoot: packages,
    systemRoot: scope.runtimeProfile.systemRoot,
  };
  const copied = await captureWebProfileRuntime(input);
  assert.equal(copied.toolchainDigest, scope.runtimeProfile.toolchainDigest);
  mark("exact reviewed toolchain copy", {
    files: copied.observedFiles,
    bytes: copied.observedBytes,
  });
  const sdkFile = path.join(dotnet, "sdk/8.0.426/Sdks/Microsoft.NET.Sdk/Sdk/Sdk.props"),
    sdkBytes = await readFile(sdkFile);
  try {
    await writeFile(
      sdkFile,
      Buffer.concat([sdkBytes, Buffer.from("\n<!-- synthetic changed SDK -->")]),
    );
    await assert.rejects(
      () => revalidateWebProfileRuntime(workspace, copied),
      /provenance differs/,
    );
    mark("SDK import byte mutation rejected");
  } finally {
    await writeFile(sdkFile, sdkBytes);
  }
  await assert.rejects(
    () => revalidateWebProfileRuntime(workspace, { ...copied, environmentDigest: "0".repeat(64) }),
    /effective environment changed/,
  );
  mark("effective environment identity rejected");
  assert.deepEqual(await revalidateWebProfileRuntime(workspace, copied), copied);
  mark("exact copied toolchain restoration");
  assert.equal((await store.read(target)).digest, configured.digest);
  assert.equal(native.record.runs.length, 1);
  summary.status = "PASS";
} catch (e) {
  summary.status = "FAIL";
  summary.error = e.stack;
  process.exitCode = 1;
} finally {
  await writeFile(
    path.join(home, "f1-web-freshness-summary.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log(
    JSON.stringify({ status: summary.status, cases: summary.cases.length, error: summary.error }),
  );
}
