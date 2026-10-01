// Z8.3-S1 behavior tests: the local, previewed Graph support bundle (Host side).
// FIXTURES: every profile is a synthetic temporary directory. Records are the unmodified historical fixture bytes
// (docs/graph-engineering/z8/fixtures/historical, read-only) parsed in memory, rewritten onto synthetic workspace
// paths, and planted with canary strings; the fixture files themselves are never changed. No real credential,
// provider, profile, account or network is involved. The only socket is a loopback recorder.
// MOCKS (labelled): `net.Socket.prototype.connect` and `dns.lookup` are wrapped as counters for the zero-network check;
// flavor/facts overrides are test inputs. Nothing here measures packaged-app or whole-application network behavior.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import dns from "node:dns";
import net, { type AddressInfo } from "node:net";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { mock } from "node:test";
import { fileURLToPath } from "node:url";
import { isSensitiveCredentialFileName, resolveGraphSupportBundlePolicy } from "@zcode/shared";
import { GraphEngineeringService } from "../src/graph-engineering/app/service.js";
import { createGraphRepository } from "../src/graph-engineering/adapters/repository.js";
import { createGraphSupportService } from "../src/graph-engineering/adapters/support-bundle.js";
import { recordSchema } from "../src/graph-engineering/domain/record.js";
import {
  buildSupportBundle,
  type GraphSupportBundleFacts,
} from "../src/graph-engineering/app/support-bundle.js";
import {
  GraphSupportBundleError,
  serializeSupportBundle,
  supportBundleSchema,
} from "../src/graph-engineering/domain/support-bundle.js";
import { GRAPH_SUPPORT_BUNDLE_MAX_BYTES } from "../src/graph-engineering/support-bundle-types.js";

const historical = fileURLToPath(
  new URL("../../../docs/graph-engineering/z8/fixtures/historical/", import.meta.url),
);
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

// ───────────────────────────── synthetic profile ─────────────────────────────

const FIXTURES = [
  "z22-completed-sequential", // v2, Completed
  "z75-test-failure-despite-model-pass", // v4, Failed, tool attempts with output
  "z75-needs-human-exhausted", // v5, BudgetExhausted, routing
  "z22-z1-literal-completed", // legacy (no version)
  "z75-approval-rejected-terminal", // v3, Rejected, approval attempts
] as const;
const TEXT_KEY =
  /^(instructions|resolvedInstructions|request|startInput|message|text|outputIssue|reason|name|taskName|comment|summary|cwd)$/;
const classOf = (path: (string | number)[]) => {
  const key = String(path.at(-1));
  const joined = path.join(".");
  if (key === "instructions" || key === "resolvedInstructions") return "prompt";
  if (key === "request" || key === "startInput") return "startInput";
  if (key === "cwd") return "path";
  if (/stdout|stderr/.test(joined)) return "terminalOutput";
  if (/finalOutput|bindings/.test(joined)) return "modelOutput";
  if (key === "text" || key === "comment") return "evidenceText";
  return "message";
};

function textPaths(
  value: unknown,
  path: (string | number)[] = [],
  out: (string | number)[][] = [],
) {
  if (typeof value === "string") {
    if (TEXT_KEY.test(String(path.at(-1)))) out.push(path);
  } else if (Array.isArray(value))
    value.forEach((item, index) => textPaths(item, [...path, index], out));
  else if (value && typeof value === "object")
    for (const key of Object.keys(value))
      textPaths((value as Record<string, unknown>)[key], [...path, key], out);
  return out;
}
function replaceStrings(value: unknown, from: string, to: string): unknown {
  if (typeof value === "string") return value.replaceAll(from, to);
  if (Array.isArray(value)) return value.map((item) => replaceStrings(item, from, to));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceStrings(item, from, to)]),
    );
  return value;
}
/** Reverses key order at every depth: same data, different source ordering. */
function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, item]) => [key, reverseKeys(item)]),
    );
  return value;
}
function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) allStrings(item, out);
  else if (value && typeof value === "object")
    for (const item of Object.values(value)) allStrings(item, out);
  return out;
}

interface Planted {
  records: Array<{ key: string; hash: string; json: Record<string, unknown> }>;
  /** canary → class */
  canaries: Map<string, string>;
  /** every free-text/long string of the source records (ids and enum words are removed later). */
  sourceStrings: Set<string>;
  originalRoots: string[];
}

async function loadPlantedRecords(profileRoot: string): Promise<Planted> {
  const canaries = new Map<string, string>();
  const records: Planted["records"] = [];
  const originalRoots: string[] = [];
  const sourceStrings = new Set<string>();
  let counter = 0;
  for (const [index, name] of FIXTURES.entries()) {
    const dir = join(historical, name, "graph-engineering");
    const file = (await readdir(dir)).find((item) => /^[0-9a-f]{64}\.json$/.test(item))!;
    let json = JSON.parse(await readFile(join(dir, file), "utf8")) as Record<string, any>;
    const oldKey = json.workspaceKey as string;
    originalRoots.push(oldKey);
    // Alternate POSIX and Windows-shaped synthetic workspaces under the synthetic user-profile root.
    const newKey =
      index % 2 === 0
        ? `${profileRoot}/Projects/canary-workspace-${index}`
        : `${profileRoot.replaceAll("/", "\\")}\\Projects\\canary-workspace-${index}`;
    json = replaceStrings(json, oldKey, newKey) as Record<string, any>;
    json.workspaceKey = newKey;
    // Greedy planting: a canary stays only if the strict record schema still accepts the record.
    for (const path of textPaths(json)) {
      const candidate = structuredClone(json);
      let holder: any = candidate;
      for (const part of path.slice(0, -1)) holder = holder[part];
      const canary = `ZXCANARY_${classOf(path)}_${(counter += 1)}`;
      holder[path.at(-1)!] += ` ${canary}`;
      if (recordSchema.safeParse(candidate).success) {
        json = candidate;
        canaries.set(canary, classOf(path));
      }
    }
    recordSchema.parse(json);
    for (const text of allStrings(json)) if (text.length >= 12) sourceStrings.add(text);
    records.push({ key: newKey, hash: sha256(newKey), json });
  }
  return { records, canaries, sourceStrings, originalRoots };
}

interface Profile {
  root: string;
  profileRoot: string;
  graphDir: string;
  planted: Planted;
  /** canary strings planted in files the builder must never read (outside the record set). */
  fileCanaries: Map<string, string>;
}

async function writeFiles(files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, content);
  }
}

async function makeProfile(options: { reverse?: boolean } = {}): Promise<Profile> {
  const root = await mkdtemp(join(tmpdir(), "zcode-s1-"));
  const profileRoot = join(root, "Users", "canary-user-7f3a");
  const graphDir = join(
    profileRoot,
    ".zcode-graph-engineering",
    "home",
    ".zcode",
    "v2",
    "graph-engineering",
  );
  const zcodeHome = join(profileRoot, ".zcode-graph-engineering", "home", ".zcode");
  await mkdir(graphDir, { recursive: true });
  const planted = await loadPlantedRecords(profileRoot);
  const list = options.reverse ? [...planted.records].reverse() : planted.records;
  for (const item of list) {
    const body = options.reverse ? reverseKeys(item.json) : item.json;
    await writeFile(join(graphDir, `${item.hash}.json`), JSON.stringify(body, null, 2));
  }
  const fileCanaries = new Map<string, string>([
    ["ZXCANARY_credentials_sk-ant-api03-AAAA", "credentials"],
    ["ZXCANARY_providerUrl_https://canary-provider.example.test/v1", "providerUrl"],
    ["ZXCANARY_providerConfig_apiKey", "providerConfig"],
    ["ZXCANARY_oauth_refresh_ZZZ", "oauth"],
    ["ZXCANARY_cookie_session=abc123", "cookie"],
    ["ZXCANARY_header_Authorization_Bearer_ZZZ", "header"],
    ["ZXCANARY_proxy_http://proxyuser:proxypass@proxy-canary.example.test:3128", "proxy"],
    ["ZXCANARY_log_line_with_prompt", "log"],
    ["ZXCANARY_source_function_secret", "source"],
    ["ZXCANARY_artifact_contents", "artifact"],
    ["ZXCANARY_attachment_bytes", "attachment"],
    ["ZXCANARY_snapshot_backup", "snapshot"],
    ["ZXCANARY_native_raw_record", "nativeRaw"],
    ["ZXCANARY_library_entry", "library"],
  ]);
  const by = (cls: string) => [...fileCanaries].find(([, value]) => value === cls)![0];
  const firstHash = planted.records[0]!.hash;
  await writeFiles({
    // Credential-shaped and provider files, in and around the Graph data directory.
    [join(zcodeHome, "credentials.json")]: JSON.stringify({
      apiKey: by("credentials"),
      refresh: by("oauth"),
    }),
    [join(graphDir, "credentials.json")]: by("credentials"),
    [join(graphDir, "artifacts", "credentials.json")]: by("credentials"),
    [join(zcodeHome, "providers.json")]: JSON.stringify({
      baseUrl: by("providerUrl"),
      apiKey: by("providerConfig"),
      headers: { Authorization: by("header"), Cookie: by("cookie") },
      proxy: by("proxy"),
    }),
    [join(zcodeHome, "logs", "app.log")]: `${by("log")}\n`,
    [join(zcodeHome, "cli", "db", "native-raw.json")]: by("nativeRaw"),
    // Graph-owned stores that the bundle only measures.
    [join(graphDir, "artifacts", "run-1", "output.txt")]: by("artifact"),
    [join(graphDir, "artifacts", "run-1", "attachment.bin")]: by("attachment"),
    [join(graphDir, "reconcile-snapshots", firstHash, `${sha256("x")}.json`)]: by("snapshot"),
    [join(graphDir, "workspaces", "copy-1", "src", "secret.ts")]:
      `export const secret = "${by("source")}";`,
    [join(graphDir, "workspaces", "copy-1", ".env")]: `TOKEN=${by("credentials")}`,
    [join(graphDir, `${firstHash}.json.lock`, "owner.txt")]: by("log"),
    [join(graphDir, "unrelated-notes.txt")]: by("log"),
  });
  const library = JSON.parse(
    await readFile(
      join(historical, "z75-library-user-versions", "graph-engineering", "workflow-library.json"),
      "utf8",
    ),
  ) as Record<string, any>;
  for (const text of allStrings(library)) if (text.length >= 12) planted.sourceStrings.add(text);
  await writeFile(join(graphDir, "workflow-library.json"), JSON.stringify(library, null, 2));
  return { root, profileRoot, graphDir, planted, fileCanaries };
}

const FACTS: GraphSupportBundleFacts = {
  appVersion: "9.9.9-s1.test",
  buildCommit: "0123456789abcdef0123456789abcdef01234567",
  buildTime: "2026-01-02T03:04:05.000Z",
  electron: "41.0.3",
  node: "24.14.0",
  protocol: { name: "ZCode Protocol", version: 1, v4WireVersion: 3 },
  recordVersionMax: 5,
  instructionContractMax: 2,
  platform: "win32",
  arch: "x64",
  parallelWorkflows: "disabled",
  automaticNetwork: {
    builtinProviderCatalog: false,
    clientConfig: false,
    clientScenes: false,
    desktopRollout: false,
    helpConfig: false,
    pluginMarketplace: false,
  },
  automaticTelemetry: false,
  feedbackSubmission: false,
};

function builderFor(profile: Profile, flavor: "graph" | "production" | "preview" = "graph") {
  return createGraphSupportService({
    directory: profile.graphDir,
    repository: createGraphRepository(profile.graphDir),
    flavor,
    facts: () => FACTS,
  });
}

async function digestTree(directory: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (current: string) => {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )) {
      const path = join(current, entry.name);
      const relative = path.slice(directory.length);
      if (entry.isDirectory()) {
        out.push(`d ${relative}`);
        await walk(path);
      } else out.push(`f ${relative} ${(await stat(path)).size} ${sha256(await readFile(path))}`);
    }
  };
  await walk(directory);
  return out;
}

/** The acceptance scanner: every forbidden string, in raw and JSON-escaped form. */
function findLeaks(text: string, forbidden: Iterable<string>) {
  return [...forbidden].filter((value) => {
    const escaped = JSON.stringify(value).slice(1, -1);
    return text.includes(value) || text.includes(escaped);
  });
}

function pathForbidden(profile: Profile) {
  const { profileRoot } = profile;
  return new Set([
    profileRoot,
    profileRoot.replaceAll("/", "\\"),
    profile.root,
    "canary-user-7f3a",
    "C:\\Users",
    "C:/Users",
    "/Users/",
    "\\Users\\",
    "AppData",
    "zcode-graph-acceptance",
    ...profile.planted.originalRoots,
    ...profile.planted.records.map((record) => record.key),
  ]);
}

// ──────────────────────────────── tests ────────────────────────────────

test("canaries planted in every excluded class are absent from the final bundle bytes", async () => {
  const profile = await makeProfile();
  try {
    // The fixture must really contain the planted classes (the greedy planting kept them).
    const plantedClasses = new Set(profile.planted.canaries.values());
    for (const needed of [
      "prompt",
      "startInput",
      "modelOutput",
      "terminalOutput",
      "message",
      "path",
    ])
      assert.ok(plantedClasses.has(needed), `class ${needed} was planted into a valid record`);
    const result = await builderFor(profile).supportBundle();
    const forbidden = new Set<string>([
      ...profile.planted.canaries.keys(),
      ...profile.fileCanaries.keys(),
      // Excluded classes by name and by shape, independent of the canary list.
      "https://canary-provider.example.test",
      "proxy-canary.example.test",
      "sk-ant-api03",
      "Bearer",
      "Authorization",
      "Cookie",
      "apiKey",
      "baseUrl",
      "stdout",
      "stderr",
      "resolvedInstructions",
      "instructions",
      "startInput",
      "finalOutput",
      "workspacePath",
      "workspaceKey",
      "runtimeIdentity",
    ]);
    assert.deepEqual(findLeaks(result.json, forbidden), []);
    // Generic: no free-text string of any source record or the workflow library survives, except opaque ids
    // and the closed status words, which are the allowlist itself.
    const parsed = JSON.parse(result.json) as {
      workspaces: Array<{ runs: Array<Record<string, any>> }>;
    };
    const allowed = new Set<string>();
    for (const workspace of parsed.workspaces)
      for (const run of workspace.runs) {
        allowed.add(run.runId);
        for (const id of [...run.nativeSessionIds, ...run.commandIds, run.status]) allowed.add(id);
      }
    const suspicious = [...profile.planted.sourceStrings].filter(
      (text) => !allowed.has(text) && result.json.includes(JSON.stringify(text).slice(1, -1)),
    );
    // A few long source strings are legitimately the same word as an enum value ("WaitingForPermission"...).
    const closedWords = new Set([
      "WaitingForPermission",
      "AwaitingContinuation",
      "WaitingForApproval",
      "BudgetExhausted",
      "StaleEvidence",
      "CancelRequested",
    ]);
    assert.deepEqual(
      suspicious.filter((text) => !closedWords.has(text)),
      [],
    );
  } finally {
    await rm(profile.root, { recursive: true, force: true });
  }
});

test("no path under the synthetic user-profile root occurs; workspaces appear only as their expected hashes", async () => {
  const profile = await makeProfile();
  try {
    const result = await builderFor(profile).supportBundle();
    assert.deepEqual(findLeaks(result.json, pathForbidden(profile)), []);
    // No string in the document has a path shape at all.
    const strings = allStrings(JSON.parse(result.json));
    assert.deepEqual(
      strings.filter((text) => /[\\/]|^[A-Za-z]:/.test(text)),
      [],
    );
    const parsed = JSON.parse(result.json) as {
      workspaces: Array<{ workspaceHash: string; runs: unknown[] }>;
    };
    assert.deepEqual(
      parsed.workspaces.map((workspace) => workspace.workspaceHash),
      profile.planted.records.map((record) => record.hash).sort(),
    );
    for (const record of profile.planted.records) assert.equal(sha256(record.key), record.hash);
    assert.ok(parsed.workspaces.every((workspace) => workspace.runs.length > 0));
  } finally {
    await rm(profile.root, { recursive: true, force: true });
  }
});

test("the allowlisted content is present: identity, versions, policy, shape, run facts and opaque ids", async () => {
  const profile = await makeProfile();
  try {
    const result = await builderFor(profile).supportBundle();
    const bundle = supportBundleSchema.parse(JSON.parse(result.json));
    assert.equal(bundle.schema, "zcode.graph.support-bundle");
    assert.equal(bundle.schemaVersion, 1);
    assert.deepEqual(bundle.scope, { graphOnly: true, localOnly: true, transmitted: false });
    assert.equal(bundle.identity.appVersion, FACTS.appVersion);
    assert.equal(bundle.identity.buildCommit, FACTS.buildCommit);
    assert.equal(bundle.runtime.electron, "41.0.3");
    assert.equal(bundle.runtime.cli, null);
    assert.equal(bundle.os.platform, "win32");
    assert.equal(bundle.policy.automaticNetwork.clientConfig, false);
    assert.equal(bundle.policy.automaticTelemetry, false);
    assert.equal(bundle.capabilities.feedbackUpload, false);
    assert.equal(bundle.profile.records.fileCount, FIXTURES.length);
    assert.equal(bundle.profile.records.byReadStatus.ok, FIXTURES.length);
    assert.deepEqual(bundle.profile.records.byStoredVersion, {
      "1": 1,
      "2": 1,
      "3": 1,
      "4": 1,
      "5": 1,
    });
    assert.equal(bundle.profile.records.runCount, FIXTURES.length);
    assert.deepEqual(bundle.profile.records.runsByStatus, {
      BudgetExhausted: 1,
      Completed: 2,
      Failed: 1,
      Rejected: 1,
    });
    assert.deepEqual(
      {
        present: bundle.profile.workflowLibrary.present,
        readable: bundle.profile.workflowLibrary.readable,
      },
      { present: true, readable: true },
    );
    assert.equal(
      bundle.profile.artifacts.fileCount,
      2,
      "credentials.json inside artifacts/ is not even counted",
    );
    assert.equal(bundle.profile.reconcileSnapshots.workspaceCount, 1);
    assert.deepEqual(bundle.profile.parallelWorkspaces, { present: true, entryCount: 1 });
    const failed = bundle.workspaces
      .flatMap((workspace) => workspace.runs)
      .find((run) => run.status === "Failed")!;
    assert.ok(failed.errorClasses.includes("run-failed"));
    assert.ok(failed.nodeKinds.task >= 1);
    for (const workspace of bundle.workspaces)
      for (const run of workspace.runs) {
        const source = profile.planted.records
          .flatMap((record) => record.json.runs as Array<Record<string, any>>)
          .find((item) => item.id === run.runId)!;
        assert.equal(run.createdAt, source.createdAt);
        const attemptSessions = ((source.nodeAttempts ?? []) as Array<Record<string, any>>)
          .map((attempt) => attempt.sessionId)
          .filter(Boolean);
        if (source.sessionId) attemptSessions.push(source.sessionId);
        assert.deepEqual(run.nativeSessionIds, [...new Set(attemptSessions)].sort());
      }
    assert.deepEqual(
      result.sections.map((section) => section.id),
      ["identity", "runtime", "os", "capabilities", "policy", "profile", "workspaces", "runs"],
    );
    assert.equal(result.byteLength, new TextEncoder().encode(result.json).byteLength);
  } finally {
    await rm(profile.root, { recursive: true, force: true });
  }
});

test("an unchanged profile yields byte-identical output, also when source ordering differs", async () => {
  const first = await makeProfile();
  const second = await makeProfile({ reverse: true });
  try {
    const a = await builderFor(first).supportBundle();
    const b = await builderFor(first).supportBundle();
    assert.equal(a.json, b.json, "two generations of an unchanged profile");
    assert.deepEqual(Buffer.from(a.json), Buffer.from(b.json));
    // Different temp roots but the same synthetic content, written in reverse order with every object's keys reversed.
    // Workspace keys differ by the temp root, so compare the structure after masking the hashes and sizes that depend on it.
    const mask = (text: string) =>
      JSON.stringify(
        JSON.parse(text, (key, value) =>
          key === "workspaceHash" || key === "recordBytes" || key === "totalBytes" ? "*" : value,
        ),
      );
    const reordered = await builderFor(second).supportBundle();
    // Order of workspaces is by hash, so mask first then compare the multiset of workspaces.
    const normalize = (text: string) => {
      const doc = JSON.parse(mask(text)) as { workspaces: unknown[] };
      doc.workspaces = doc.workspaces.map((item) => JSON.stringify(item)).sort();
      return JSON.stringify(doc);
    };
    assert.equal(normalize(reordered.json), normalize(a.json));
    // Same-root reverse: rewrite the first profile's files in reverse key order and compare the exact bytes.
    for (const record of first.planted.records)
      await writeFile(
        join(first.graphDir, `${record.hash}.json`),
        JSON.stringify(reverseKeys(record.json), null, 2),
      );
    const rewritten = await builderFor(first).supportBundle();
    assert.equal(rewritten.json, a.json, "source key order does not change the bundle bytes");
  } finally {
    await rm(first.root, { recursive: true, force: true });
    await rm(second.root, { recursive: true, force: true });
  }
});

test("run and id ordering is normalized before serialization", () => {
  const entry = (hash: string, order: "asc" | "desc") => {
    const runs = [
      legacyRun("run-b", 20, ["s-2", "s-1"], ["c-2", "c-1"]),
      legacyRun("run-a", 20, ["s-1"], ["c-1"]),
      legacyRun("run-c", 10, [], []),
    ];
    return {
      hash,
      bytes: 10,
      readStatus: "ok",
      storedVersion: 2,
      record: {
        definition: { version: 2, nodes: [] } as never,
        runs: order === "asc" ? runs : runs.reverse(),
      },
    } as never;
  };
  const input = (records: unknown[]) => ({
    facts: FACTS,
    records: records as never,
    stores: STORES,
    sha256,
  });
  const forward = buildSupportBundle(
    input([entry("b".repeat(64), "asc"), entry("a".repeat(64), "asc")]),
  );
  const backward = buildSupportBundle(
    input([entry("a".repeat(64), "desc"), entry("b".repeat(64), "desc")]),
  );
  assert.equal(
    serializeSupportBundle(forward.bundle).json,
    serializeSupportBundle(backward.bundle).json,
  );
  const runs = forward.bundle.workspaces[0]!.runs;
  assert.deepEqual(
    runs.map((run) => run.runId),
    ["run-c", "run-a", "run-b"],
  );
  assert.deepEqual(runs[2]!.nativeSessionIds, ["s-1", "s-2"]);
  assert.deepEqual(
    forward.bundle.workspaces.map((workspace) => workspace.workspaceHash),
    ["a".repeat(64), "b".repeat(64)],
  );
});

const STORES = {
  workflowLibrary: { present: false, bytes: 0, readable: true, revision: null, entryCount: null },
  artifacts: { present: false, fileCount: 0, totalBytes: 0, truncated: false },
  reconcileSnapshots: {
    present: false,
    fileCount: 0,
    totalBytes: 0,
    truncated: false,
    workspaceCount: 0,
  },
  parallelWorkspaces: { present: false, entryCount: 0 },
};
function legacyRun(id: string, createdAt: number, sessions: string[], commands: string[]) {
  return {
    id,
    status: "Completed",
    createdAt,
    updatedAt: createdAt + 1,
    definition: { nodes: [{ type: "start" }, { type: "task" }, { type: "end" }] },
    version: 2,
    nodeAttempts: commands.map((commandId, index) => ({
      commandId,
      sessionId: sessions[index],
      status: "Completed",
    })),
  };
}

test("generation is read-only: the profile tree is identical before and after", async () => {
  const profile = await makeProfile();
  try {
    const before = await digestTree(profile.root);
    await builderFor(profile).supportBundle();
    await builderFor(profile).supportBundle();
    assert.deepEqual(await digestTree(profile.root), before);
  } finally {
    await rm(profile.root, { recursive: true, force: true });
  }
});

test("generation makes zero network requests (loopback recorder with a positive control)", async () => {
  const profile = await makeProfile();
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    response.end("ok");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // MOCK: counters on the two choke points every outbound connection goes through.
  const connects: unknown[] = [];
  const lookups: unknown[] = [];
  const originalConnect = net.Socket.prototype.connect;
  const originalLookup = dns.lookup as (...a: unknown[]) => unknown;
  const connect = mock.method(
    net.Socket.prototype,
    "connect",
    function (this: net.Socket, ...args: unknown[]) {
      connects.push(args[0]);
      return (originalConnect as (...a: unknown[]) => unknown).apply(this, args);
    },
  );
  const lookup = mock.method(dns, "lookup", (...args: unknown[]) => {
    lookups.push(args[0]);
    return originalLookup(...args);
  });
  const savedEnv = { ...process.env };
  process.env.HTTPS_PROXY = origin;
  process.env.HTTP_PROXY = origin;
  process.env.ALL_PROXY = origin;
  process.env.ANTHROPIC_API_KEY = "ZXCANARY_env_value_key";
  process.env.ZXCANARY_ENV_NAME = "ZXCANARY_env_value";
  try {
    // Positive control: the same instrument records a deliberate request.
    await (await fetch(`${origin}/control`)).text();
    assert.deepEqual(requests, ["GET /control"]);
    assert.ok(connects.length >= 1, "the connect counter records the control request");
    const connectsBefore = connects.length;
    const lookupsBefore = lookups.length;
    const result = await builderFor(profile).supportBundle();
    assert.equal(connects.length, connectsBefore, "no connection during generation");
    assert.equal(lookups.length, lookupsBefore, "no name lookup during generation");
    assert.deepEqual(requests, ["GET /control"], "the recorder saw only the control request");
    // Environment values never reach the bundle.
    assert.deepEqual(
      findLeaks(result.json, ["ZXCANARY_env_value_key", "ZXCANARY_env_value", origin, "ANTHROPIC"]),
      [],
    );
  } finally {
    connect.mock.restore();
    lookup.mock.restore();
    for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env, savedEnv);
    await new Promise((resolve) => server.close(resolve));
    await rm(profile.root, { recursive: true, force: true });
  }
});

test("Graph-only availability; Production, Preview and unknown flavors refuse before touching the profile", async () => {
  assert.equal(resolveGraphSupportBundlePolicy("graph").available, true);
  assert.equal(resolveGraphSupportBundlePolicy("production").available, false);
  assert.equal(resolveGraphSupportBundlePolicy("preview").available, false);
  assert.equal(resolveGraphSupportBundlePolicy("other" as never).available, false);
  const profile = await makeProfile();
  try {
    const before = await digestTree(profile.root);
    for (const flavor of ["production", "preview", "unknown"] as const) {
      let inventoryCalls = 0;
      const repository = createGraphRepository(profile.graphDir);
      const builder = createGraphSupportService({
        directory: profile.graphDir,
        repository: {
          ...repository,
          async inventory() {
            inventoryCalls += 1;
            return repository.inventory!();
          },
        },
        flavor: flavor as never,
        facts: () => FACTS,
      });
      await assert.rejects(
        builder.supportBundle(),
        (error) => error instanceof GraphSupportBundleError && error.code === "unavailable",
      );
      assert.equal(inventoryCalls, 0, `${flavor}: the profile is not read`);
    }
    assert.deepEqual(await digestTree(profile.root), before);
    // A repository that cannot list records (no inventory) is unavailable, fail closed, with no profile access.
    await assert.rejects(
      createGraphSupportService({
        directory: profile.graphDir,
        repository: {} as never,
        flavor: "graph",
        facts: () => FACTS,
      }).supportBundle(),
      (error) => error instanceof GraphSupportBundleError && error.code === "unavailable",
    );
    // The existing Graph service is not touched by this feature: no new method, same behavior.
    const service = new GraphEngineeringService({
      repository: { read: async () => null, write: async () => {} },
      native: { available: async () => ({ available: true }) } as never,
      id: () => "id",
      now: () => 1,
    });
    assert.equal("supportBundle" in service, false);
    const view = await service.getWorkspace({ workspacePath: "/synthetic/z1" });
    assert.deepEqual(view.runs, [], "non-support behavior is unaffected");
  } finally {
    await rm(profile.root, { recursive: true, force: true });
  }
});

test("unreadable data, oversize and malformed records become fixed, path-free outcomes", async () => {
  const profile = await makeProfile();
  try {
    const secretPath = join(profile.profileRoot, "secret", "ZXCANARY_error_path");
    const failing = createGraphSupportService({
      directory: profile.graphDir,
      repository: {
        inventory: async () => {
          throw new Error(`EACCES: permission denied, open '${secretPath}'`);
        },
      },
      flavor: "graph",
      facts: () => FACTS,
    });
    const before = await digestTree(profile.root);
    await assert.rejects(failing.supportBundle(), (error) => {
      assert.ok(error instanceof GraphSupportBundleError);
      assert.equal(error.code, "profile-unreadable");
      assert.ok(!error.message.includes("ZXCANARY") && !error.message.includes(profile.root));
      return true;
    });
    assert.deepEqual(
      await digestTree(profile.root),
      before,
      "a failed generation leaves nothing behind",
    );

    const huge = createGraphSupportService({
      directory: profile.graphDir,
      repository: {
        inventory: async () =>
          Array.from({ length: 60_000 }, (_, index) => ({
            hash: sha256(String(index)),
            bytes: 1,
            readStatus: "invalid" as const,
            storedVersion: null,
          })),
      },
      flavor: "graph",
      facts: () => FACTS,
    });
    await assert.rejects(
      huge.supportBundle(),
      (error) => error instanceof GraphSupportBundleError && error.code === "too-large",
    );
    assert.ok(GRAPH_SUPPORT_BUNDLE_MAX_BYTES < 50 * 1024 * 1024, "stays below the Main save limit");

    // Newer version, garbage and a hash/key mismatch are reported as states, never thrown or rewritten.
    const newer = { ...profile.planted.records[0]!.json, version: 6 };
    await writeFile(join(profile.graphDir, `${"1".repeat(64)}.json`), JSON.stringify(newer));
    await writeFile(join(profile.graphDir, `${"2".repeat(64)}.json`), "{not json");
    await writeFile(
      join(profile.graphDir, `${"3".repeat(64)}.json`),
      JSON.stringify(profile.planted.records[1]!.json),
    );
    const doc = JSON.parse((await builderFor(profile).supportBundle()).json) as {
      workspaces: Array<{
        workspaceHash: string;
        readStatus: string;
        storedVersion: number | null;
        runCount: number;
      }>;
    };
    const status = (hash: string) => doc.workspaces.find((item) => item.workspaceHash === hash)!;
    assert.deepEqual(
      { ...status("1".repeat(64)) },
      {
        workspaceHash: "1".repeat(64),
        recordBytes: status("1".repeat(64)).recordBytes,
        readStatus: "unsupported-newer-version",
        storedVersion: 6,
        runCount: 0,
        runsByStatus: {},
        runs: [],
      },
    );
    assert.equal(status("2".repeat(64)).readStatus, "invalid");
    assert.equal(
      status("3".repeat(64)).readStatus,
      "invalid",
      "workspace key does not hash to the file name",
    );
  } finally {
    await rm(profile.root, { recursive: true, force: true });
  }
});

test("path-like and oversized ids are replaced by a hash, never copied", () => {
  const hostile = "/home/canary-user/.zcode/session-ZXCANARY_id";
  const run = legacyRun("run-1", 1, [hostile], [`C:\\Users\\canary\\${"x".repeat(300)}`]);
  const { bundle } = buildSupportBundle({
    facts: FACTS,
    records: [
      {
        hash: "a".repeat(64),
        bytes: 1,
        readStatus: "ok",
        storedVersion: 2,
        record: { definition: {} as never, runs: [run as never] },
      },
    ],
    stores: STORES,
    sha256,
  });
  const text = serializeSupportBundle(bundle).json;
  assert.deepEqual(
    findLeaks(text, [hostile, "canary-user", "C:\\Users", "xxxxxxxxxx", "ZXCANARY"]),
    [],
  );
  assert.match(bundle.workspaces[0]!.runs[0]!.nativeSessionIds[0]!, /^hash-[0-9a-f]{32}$/);
});

test("MUTATION: adding an excluded field or a raw path to the model fails serialization, and the scanner flags the bypassed leak", () => {
  const { bundle } = buildSupportBundle({
    facts: FACTS,
    records: [
      {
        hash: "a".repeat(64),
        bytes: 1,
        readStatus: "ok",
        storedVersion: 2,
        record: {
          definition: {} as never,
          runs: [legacyRun("run-1", 1, ["s-1"], ["c-1"]) as never],
        },
      },
    ],
    stores: STORES,
    sha256,
  });
  serializeSupportBundle(bundle); // the unmutated model serializes
  const leakyPrompt = "ZXCANARY_mutation_prompt";
  const leakyPath = "/home/canary-user/.zcode/credentials.json";
  const mutations: Array<[string, (copy: any) => void, string]> = [
    [
      "prompt field on a run",
      (copy) => (copy.workspaces[0].runs[0].startInput = leakyPrompt),
      leakyPrompt,
    ],
    [
      "raw message on a run",
      (copy) => (copy.workspaces[0].runs[0].message = leakyPrompt),
      leakyPrompt,
    ],
    [
      "provider configuration section",
      (copy) => (copy.provider = { baseUrl: leakyPrompt }),
      leakyPrompt,
    ],
    ["environment section", (copy) => (copy.env = { TOKEN: leakyPrompt }), leakyPrompt],
    [
      "workspace path next to the hash",
      (copy) => (copy.workspaces[0].workspacePath = leakyPath),
      leakyPath,
    ],
    ["raw path as a run id", (copy) => (copy.workspaces[0].runs[0].runId = leakyPath), leakyPath],
    [
      "raw path as a native session id",
      (copy) => (copy.workspaces[0].runs[0].nativeSessionIds = [leakyPath]),
      leakyPath,
    ],
    ["raw path in the build commit", (copy) => (copy.identity.buildCommit = leakyPath), leakyPath],
  ];
  for (const [name, mutate, canary] of mutations) {
    const copy = structuredClone(bundle) as any;
    mutate(copy);
    assert.throws(
      () => serializeSupportBundle(copy),
      GraphSupportBundleError,
      `${name}: serialization refuses`,
    );
    // The acceptance scanner has teeth: bypassing the serializer, the same leak is found in the bytes.
    assert.deepEqual(
      findLeaks(JSON.stringify(copy, null, 2), [canary]),
      [canary],
      `${name}: the scanner flags it`,
    );
  }
});

test("the credential-file name set is the one shared with the log export", async () => {
  for (const name of ["credentials.json", ".credentials.json", "CREDENTIALS.JSON"])
    assert.equal(isSensitiveCredentialFileName(name), true);
  assert.equal(isSensitiveCredentialFileName("credentials.json.bak"), false);
  // SOURCE-TEXT GUARD (labelled): exportLogs.ts cannot be imported without Electron; it must use the shared predicate.
  const source = await readFile(
    fileURLToPath(new URL("../../desktop/src/main/exportLogs.ts", import.meta.url)),
    "utf8",
  );
  assert.match(source, /isSensitiveCredentialFileName\(fileName\)/);
  assert.doesNotMatch(source, /SENSITIVE_CREDENTIAL_ARCHIVE_FILE_NAMES/);
});
