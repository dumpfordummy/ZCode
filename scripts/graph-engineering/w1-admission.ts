// Z8.3-W1 R-1 / R-6: process-backed admission check of the REAL bundled agent.
//
// What is real: the bundled agent (resources/glm/zcode.cjs of the detached, hash-verified package, started through the
// packaged executable in ELECTRON_RUN_AS_NODE mode exactly like the Host does), the Host's stdio transport, protocol
// client, `readRuntimeCapabilities`, the Graph runtime gate and `GraphEngineeringService.run` admission through the
// production composition root (`createGraphEngineeringService`).
// What is NOT the packaged app: this runs the Host-side TypeScript from source (tsx), because the packaged Host cannot be
// pointed at a different agent command (the ZCODE_AGENT_SERVER_COMMAND override has no storage-startup support, so the
// packaged Host refuses it: recorded in the report). Session/model/setting services are stubs that count calls.
//
// Modes (see w1-agent-recorder.cjs): record | strip-contract | wrong-wire | method-missing. The three negative modes are
// SYNTHETIC process-backed fixtures around the real agent; they are not an actual historical packaged agent.
//
// usage: node --import tsx scripts/graph-engineering/w1-admission.ts --mode=record|strip-contract|wrong-wire|method-missing
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ZCodeStdioTransport } from "../../packages/services/src/zcode-agent/zcodeStdioTransport.js";
import { ZCodeProtocolClient } from "../../packages/services/src/zcode-agent/zcodeProtocolClient.js";
import { readRuntimeCapabilities } from "../../packages/services/src/zcode-agent/runtimeCapabilities.js";
import { createGraphEngineeringService } from "../../packages/services/src/graph-engineering/node.js";
import { GraphRuntimeIncompatibleError } from "../../packages/services/src/graph-engineering/domain/native-runtime-contract.js";
import {
  selection,
  sequenceDefinition,
  target,
} from "../../packages/services/src/graph-engineering/app/sequential.fixture.js";

const mode = process.argv.find((item) => item.startsWith("--mode="))?.slice(7) ?? "record";
assert.ok(
  ["record", "strip-contract", "wrong-wire", "method-missing"].includes(mode),
  "unknown --mode",
);
const exe = process.env.Z1_PACKAGED_EXE;
assert.ok(exe, "Z1_PACKAGED_EXE must point at the detached packaged ZCode Graph.exe");
const here = import.meta.dirname;
const work = await mkdtemp(path.join(tmpdir(), "zcode-w1-admission-"));
const log = path.join(work, "recorder.jsonl");
await writeFile(log, "");
const workspace = path.join(work, "workspace");
await import("node:fs/promises").then((fs) => fs.mkdir(workspace, { recursive: true }));

const child = spawn(process.execPath, [path.join(here, "w1-agent-recorder.cjs")], {
  cwd: workspace,
  env: {
    // Minimal environment: no operator profile, credentials or provider settings are passed.
    SystemRoot: process.env.SystemRoot ?? "",
    PATH: process.env.PATH ?? "",
    HOME: work,
    USERPROFILE: work,
    APPDATA: path.join(work, "appdata"),
    LOCALAPPDATA: path.join(work, "localappdata"),
    TEMP: work,
    TMP: work,
    ZCODE_DATA_BASE_DIR: path.join(work, "data"),
    ZCODE_HOME: path.join(work, "data", ".zcode"),
    ZCODE_STORAGE_DIR: path.join(work, "data", ".zcode"),
    ZCODE_ENV: "test",
    // The real Host passes these two paths when it spawns the agent (the agent refuses to start without them).
    ZCODE_BUILTIN_PROVIDER_CONFIG_FILE: path.join(
      path.dirname(exe),
      "resources",
      "config",
      "provider",
      "zcode-builtin.json",
    ),
    ZCODE_PERSONAL_PROVIDER_CONFIG_FILE: path.join(
      work,
      "data",
      ".zcode",
      "v2",
      "provider_config.json",
    ),
    W1_RECORDER_MODE: mode,
    W1_RECORDER_LOG: log,
    W1_REAL_AGENT_EXE: exe,
    W1_REAL_AGENT_BUNDLE: path.join(path.dirname(exe), "resources", "glm", "zcode.cjs"),
  },
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
});
child.stderr.on("data", () => {});
const transport = new ZCodeStdioTransport(child as never);
const client = new ZCodeProtocolClient(transport, { requestTimeoutMs: 30_000 });

const calls: string[] = [];
let probeError: unknown;
const directory = path.join(work, "graph");
const graph = createGraphEngineeringService({
  directory,
  agentService: {
    async readRuntimeCapabilities() {
      calls.push("capabilities");
      try {
        return await readRuntimeCapabilities(client);
      } catch (error) {
        probeError = {
          name: (error as Error).name,
          code: (error as { code?: unknown }).code,
          message: String((error as Error).message).slice(0, 160),
        };
        throw error;
      }
    },
    async getWorkspaceRuntimeIdentity() {
      calls.push("identity");
      throw new Error("reached past admission (stub)");
    },
  } as never,
  sessionService: {
    async initializeWorkspace() {
      calls.push("initialize");
      return { available: true, workspaceKey: target.workspacePath };
    },
    async createSession() {
      calls.push("createSession");
      throw new Error("reached past admission (stub)");
    },
  } as never,
  modelSelectionService: {
    async getView() {
      return { providers: [{ providerId: "fixture", models: [{ modelId: "native" }] }] };
    },
  } as never,
  settingService: {
    async get() {
      return { askUserQuestionAutoResolutionEnabled: false };
    },
  } as never,
  gitService: {} as never,
});

const summary: Record<string, unknown> = {
  mode,
  label:
    mode === "record"
      ? "real agent, unmodified"
      : "SYNTHETIC process-backed negative fixture around the REAL bundled agent; not an actual historical packaged agent",
};
let failure: unknown;
try {
  const view = await graph.getWorkspace(target);
  await graph.saveDefinition({
    target,
    definition: sequenceDefinition(),
    expectedRevision: view.definition.revision,
  });
  let admission: Record<string, unknown>;
  try {
    await graph.run({
      target,
      requestId: `w1-${mode}`,
      revision: view.definition.revision + 1,
      modelSelection: selection,
      mode: "build",
      planEnabled: false,
    });
    admission = { outcome: "run-returned" };
  } catch (error) {
    if (error instanceof GraphRuntimeIncompatibleError) {
      admission = {
        outcome: "rejected",
        errorName: error.name,
        message: error.message.slice(0, 600),
        diagnostic: (error as { diagnostic?: unknown }).diagnostic,
      };
    } else {
      admission = {
        outcome: "admitted-then-stub-stopped",
        stubError: String((error as Error).message).slice(0, 120),
      };
    }
  }
  const events = (await readFile(log, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const methods = events
    .filter((event) => event.event === "host-to-agent")
    .map((event) => event.method as string);
  const response = events.find((event) => event.event === "capabilities-response");
  summary.admission = admission;
  summary.hostCalls = calls;
  summary.probeError = probeError;
  summary.agentMethodsRequestedByHost = methods;
  summary.capabilitiesAsDeliveredToHost = response;
  summary.mutations = events.filter(
    (event) => event.event === "synthetic-mutation" || event.event === "synthetic-method-not-found",
  );
  summary.runsPersisted = (await graph.getWorkspace(target)).runs.length;
  assert.ok(methods.includes("runtime/capabilities"), "the real admission probe asked the agent");
  if (mode === "record") {
    assert.equal(response?.source, "real-bundled-agent");
    assert.equal(response?.nativeContractPresent, true);
    assert.notEqual(admission.outcome, "rejected", "current agent must be admitted");
    // Admission is the probe itself: the run was not rejected as incompatible. What the stubbed services do afterwards
    // (here a later model-selection check) is outside this check; the packaged Tool-only/model runs prove real execution.
    assert.ok(calls.includes("capabilities"), "the gate probed the real agent");
  } else {
    assert.equal(admission.outcome, "rejected");
    assert.equal(summary.runsPersisted, 0, "no run persisted");
    assert.ok(
      !calls.includes("createSession") && !calls.includes("identity"),
      "no native session creation attempted",
    );
    for (const forbidden of [
      "session/create",
      "v4/command",
      "session/recipe/start",
      "v4/conversation/subscribe",
    ])
      assert.ok(!methods.includes(forbidden), `the agent never received ${forbidden}`);
  }
  summary.status = "PASS";
} catch (error) {
  failure = error;
  summary.status = "FAIL";
  summary.error = error instanceof Error ? error.stack : String(error);
  process.exitCode = 1;
} finally {
  client.dispose();
  child.kill();
  await rm(work, { recursive: true, force: true }).catch(() => {});
}
console.log(JSON.stringify(summary, null, 2));
void failure;
