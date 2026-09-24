import assert from "node:assert/strict";
import test from "node:test";
import { parsePublishArgs, publishGraph, repositoryFromUrl } from "./publish-core.mjs";

const sha = "a".repeat(40);
const other = "b".repeat(40);
const version = "3.14.0-z2.1";
const tag = `graph-v${version}`;
const release = {
  tag_name: tag,
  draft: false,
  prerelease: true,
  html_url: `https://github.com/dumpfordummy/ZCode/releases/tag/${tag}`,
  assets: [
    { name: `ZCode.Graph-${version}-win-x64.exe`, size: 123 },
    { name: "SHA256SUMS.txt", size: 100 },
  ],
};
const run = {
  databaseId: 123,
  headSha: sha,
  headBranch: tag,
  event: "push",
  status: "completed",
  conclusion: "success",
  url: "https://github.com/dumpfordummy/ZCode/actions/runs/123",
};
function fixture(options = {}) {
  const calls = [];
  const logs = [];
  let clock = 0;
  let remote = options.remote ?? "";
  let local = options.local ?? "";
  let observed = false;
  let polls = 0;
  const deps = {
    log: (text) => logs.push(text),
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    exec: async (command, args) => {
      calls.push([command, ...args]);
      const joined = args.join(" ");
      if (command === "git") {
        if (args[0] === "status") return options.dirty ? " M file.ts" : "";
        if (args[0] === "remote")
          return options.origin ?? "https://github.com/dumpfordummy/ZCode.git";
        if (args[0] === "rev-parse") return joined.includes("refs/tags/") ? local : sha;
        if (args[0] === "tag" && args[1] === "--list") return local ? tag : "";
        if (args[0] === "ls-remote") return remote ? `${remote}\trefs/tags/${tag}` : "";
        if (args[0] === "tag" && args[1] === "-a") {
          local = sha;
          return "";
        }
        if (args[0] === "push") {
          if (options.pushFailure) throw new Error("push rejected");
          remote = sha;
          return "";
        }
      }
      if (command === "gh") {
        if (args[0] === "--version") return "gh fixture";
        if (args[0] === "api") {
          const endpoint = args.at(-1);
          if (endpoint.includes("/releases/tags/")) {
            if (options.existingRelease || observed)
              return JSON.stringify(options.release ?? release);
            throw Object.assign(new Error("HTTP 404"), { stderr: "HTTP 404" });
          }
          if (endpoint.includes("/actions/workflows/"))
            return JSON.stringify({ state: options.disabled ? "disabled_manually" : "active" });
          return JSON.stringify({ permissions: { push: !options.noAccess }, archived: false });
        }
        if (args[0] === "run") {
          observed = true;
          return JSON.stringify(options.frames?.[polls++] ?? options.runs ?? [run]);
        }
      }
      throw new Error(`Unexpected fixture call: ${command} ${joined}`);
    },
  };
  return { deps, calls, logs };
}
const options = (extra = {}) => ({
  version,
  dryRun: false,
  resume: false,
  timeoutMinutes: 1,
  ...extra,
});
const writes = (calls) =>
  calls.filter(
    (call) => call[0] === "git" && (call[1] === "push" || (call[1] === "tag" && call[2] === "-a")),
  );

test("arguments require an explicit supported version and reject ambiguous switches", () => {
  assert.equal(parsePublishArgs(["--version", "3.14.0-z7.1"]).version, "3.14.0-z7.1");
  assert.equal(parsePublishArgs(["--version", version, "--dry-run"]).dryRun, true);
  for (const args of [
    [],
    ["--version", "3.14.0"],
    ["--version", "3.14.0-z3.1"],
    ["--version", "3.14.0-z8.1"],
    ["--version", "3.14.0-z2.01"],
    ["--version", version, "--force"],
    ["--version", version, "--version", version],
    ["--version", version, "--timeout-minutes", "0"],
  ]) {
    assert.throws(() => parsePublishArgs(args));
  }
});

test("origin accepts GitHub HTTPS/SSH only and refuses embedded credentials", () => {
  for (const url of [
    "https://github.com/dumpfordummy/ZCode.git",
    "git@github.com:dumpfordummy/ZCode.git",
    "ssh://git@github.com/dumpfordummy/ZCode.git",
  ])
    assert.equal(repositoryFromUrl(url).toLowerCase(), "dumpfordummy/zcode");
  for (const url of [
    "https://token@github.com/dumpfordummy/ZCode",
    "https://github.com.evil.test/dumpfordummy/ZCode",
    "../repo",
    "https://github.com/dumpfordummy/ZCode?x=1",
  ])
    assert.throws(() => repositoryFromUrl(url));
});

test("dry-run performs only local Git reads", async () => {
  const f = fixture();
  await publishGraph(options({ dryRun: true }), f.deps);
  assert.equal(writes(f.calls).length, 0);
  assert.ok(f.calls.every((call) => call[0] === "git" && call[1] !== "ls-remote"));
  assert.ok(f.logs.some((line) => line.includes("DRY RUN")));
});

for (const [name, settings, message] of [
  ["dirty checkout", { dirty: true }, /uncommitted/],
  ["wrong origin", { origin: "https://github.com/someone/upstream.git" }, /origin/],
  [
    "multiple destinations",
    { origin: "https://github.com/dumpfordummy/ZCode.git\nhttps://github.com/other/repo.git" },
    /origin/,
  ],
  ["local collision", { local: sha }, /already exists/],
  ["remote collision", { remote: sha }, /already exists/],
  ["release collision", { existingRelease: true }, /already exists/],
  ["no push access", { noAccess: true }, /write access/],
  ["disabled workflow", { disabled: true }, /active/],
])
  test(`refuses ${name} without any Git write`, async () => {
    const f = fixture(settings);
    await assert.rejects(publishGraph(options(), f.deps), message);
    assert.equal(writes(f.calls).length, 0);
  });

test("success pushes only the exact tag and verifies the release assets", async () => {
  const f = fixture();
  const result = await publishGraph(options(), f.deps);
  assert.equal(result.url, release.html_url);
  assert.deepEqual(writes(f.calls), [
    ["git", "tag", "-a", tag, sha, "-m", `ZCode Graph ${version} prerelease`],
    ["git", "push", "--no-follow-tags", "origin", `refs/tags/${tag}:refs/tags/${tag}`],
  ]);
});

test("resume observes existing matching remote tag without rewriting it", async () => {
  const f = fixture({ remote: sha, existingRelease: true });
  await publishGraph(options({ resume: true }), f.deps);
  assert.equal(writes(f.calls).length, 0);
});

test("resume can push a local-only matching tag after a failed push", async () => {
  const f = fixture({ local: sha });
  await publishGraph(options({ resume: true }), f.deps);
  assert.equal(writes(f.calls).length, 1);
  assert.equal(writes(f.calls)[0][1], "push");
});

for (const settings of [{ remote: other }, { local: other }, {}])
  test(`resume refuses foreign or missing tags ${JSON.stringify(settings)}`, async () => {
    const f = fixture(settings);
    await assert.rejects(publishGraph(options({ resume: true }), f.deps), /commit|existing tag/);
    assert.equal(writes(f.calls).length, 0);
  });

test("push failure leaves the tag for explicit resume and never claims publication", async () => {
  const f = fixture({ pushFailure: true });
  await assert.rejects(publishGraph(options(), f.deps), /push rejected/);
  assert.equal(
    f.calls.some((call) => call[1] === "run"),
    false,
  );
  assert.equal(
    f.logs.some((line) => line.startsWith("Published")),
    false,
  );
});

for (const conclusion of ["failure", "cancelled", "timed_out"])
  test(`CI ${conclusion} is not publication`, async () => {
    const f = fixture({ runs: [{ ...run, conclusion }] });
    await assert.rejects(publishGraph(options(), f.deps), /Workflow.*https:/);
  });

test("other tag/commit/manual runs cannot satisfy the wait", async () => {
  const f = fixture({
    runs: [
      { ...run, headBranch: "graph-v3.14.0-z1.2" },
      { ...run, headSha: other },
      { ...run, event: "workflow_dispatch" },
    ],
  });
  await assert.rejects(publishGraph(options(), f.deps), /Timed out/);
});

test("ambiguous matching workflow runs are refused", async () => {
  const f = fixture({ runs: [run, { ...run, databaseId: 456 }] });
  await assert.rejects(publishGraph(options(), f.deps), /multiple/);
});

test("queued and running states are observed until completion without another push", async () => {
  const f = fixture({
    frames: [
      [],
      [{ ...run, status: "queued", conclusion: "" }],
      [{ ...run, status: "in_progress", conclusion: "" }],
      [run],
    ],
  });
  await publishGraph(options(), f.deps);
  assert.equal(writes(f.calls).length, 2);
  assert.ok(f.logs.some((line) => line.includes("queued")));
  assert.ok(f.logs.some((line) => line.includes("in_progress")));
});

test("an authentication error is never interpreted as a missing release", async () => {
  const f = fixture();
  const exec = f.deps.exec;
  f.deps.exec = async (command, args) => {
    if (args.at(-1).includes("/releases/tags/"))
      throw Object.assign(new Error("HTTP 401"), { stderr: "HTTP 401" });
    return exec(command, args);
  };
  await assert.rejects(publishGraph(options(), f.deps), /401/);
  assert.equal(writes(f.calls).length, 0);
});

test("a changed commit during preflight is refused before a tag is created", async () => {
  const f = fixture();
  const exec = f.deps.exec;
  let reads = 0;
  f.deps.exec = async (command, args) => {
    if (command === "git" && args[0] === "rev-parse" && ++reads > 1) return other;
    return exec(command, args);
  };
  await assert.rejects(publishGraph(options(), f.deps), /changed during preflight/);
  assert.equal(writes(f.calls).length, 0);
});

test("a peeled annotated remote tag is correlated to its commit", async () => {
  const f = fixture({ remote: sha });
  const exec = f.deps.exec;
  f.deps.exec = async (command, args) => {
    if (command === "git" && args[0] === "ls-remote")
      return `${other}\trefs/tags/${tag}\n${sha}\trefs/tags/${tag}^{}`;
    return exec(command, args);
  };
  await publishGraph(options({ resume: true }), f.deps);
  assert.equal(writes(f.calls).length, 0);
});

for (const invalid of [
  { ...release, draft: true },
  { ...release, prerelease: false },
  { ...release, tag_name: "wrong" },
  { ...release, assets: [] },
  { ...release, assets: release.assets.map((asset) => ({ ...asset, size: 0 })) },
])
  test("green CI with invalid/missing release assets is refused", async () => {
    const f = fixture({ release: invalid });
    await assert.rejects(publishGraph(options(), f.deps), /release|asset/i);
  });
