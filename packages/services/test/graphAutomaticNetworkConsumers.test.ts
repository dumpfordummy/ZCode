// Z8.3-N1 behavior tests at real service boundaries.
// FIXTURES: every endpoint is a synthetic loopback HTTP server that records requests. No real host, account,
// credential or provider is involved. MOCKS (labelled): fake timers (node:test mock.timers), spy ApiClient /
// credential service / log-archive factory, and stub bundled/fetch inputs. Nothing here measures packaged-app
// network behavior.
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { mock } from "node:test";
import { createNodeProviderConfigRuntime } from "@zcode/provider-node";
import {
  resolveAutomaticNetworkPolicy,
  resolveHelpAppConfig,
  type ApiClient,
  type AutomaticNetworkPolicy,
} from "@zcode/shared";
import { createDesktopContextPromptRollout } from "../../desktop/src/main/desktopContextPromptRollout.js";
import { createDesktopHelpConfigReader } from "../../desktop/src/main/desktopHelpConfig.js";
import { createRendererActionTraceRollout } from "../../desktop/src/main/rendererActionTraceRollout.js";
import { createClientConfigService } from "../src/client-config/clientConfigService.js";
import { createClientScenesService } from "../src/client-scenes/clientScenesService.js";
import { BigModelCodingPlanSubscriptionProvider } from "../src/coding-plan-subscription/bigmodelCodingPlanSubscriptionProvider.js";
import { createProviderRuntime } from "../src/model-provider/providerRuntime.js";
import {
  FeedbackSubmissionDisabledError,
  createFeedbackService,
} from "../src/feedback/feedbackService.js";
import { createNodeApiClient } from "../src/providers/api/nodeApiClient.js";
import { setDataBaseDir } from "../src/paths.js";

const GRAPH = resolveAutomaticNetworkPolicy("graph");
const PRODUCTION = resolveAutomaticNetworkPolicy("production");
const PREVIEW = resolveAutomaticNetworkPolicy("preview");

interface Recorded {
  readonly method: string;
  readonly path: string;
}

interface Recorder {
  readonly origin: string;
  readonly requests: Recorded[];
  close(): Promise<void>;
}

function respond(request: IncomingMessage): unknown {
  const path = (request.url ?? "").split("?")[0];
  if (path === "/api/v1/client/configs") {
    return {
      code: 0,
      data: {
        configs: {
          pluginStoreOrder: { code: { categoryOrder: ["from-server"] } },
          desktopContextPrompt: { enabled: true, config_version: "synthetic-1" },
          feedbackUrl: {
            feedback_use_external_form: true,
            feedback_url: "https://upstream.invalid/form",
          },
        },
      },
    };
  }
  if (path === "/api/v1/client/scenes") {
    return {
      code: 0,
      msg: "ok",
      data: [{ namespace: "synthetic", scene: "from-server", options: {} }],
    };
  }
  if (path === "/api/v1/feedback/ticket") {
    return { code: 0, data: { ticket_id: "SYNTH-1", status: "open", created_at: 1_700_000_000 } };
  }
  if (path === "/v1/chat/completions") return { id: "synthetic-model-reply", choices: [] };
  return { code: 0, data: {} };
}

async function startRecorder(): Promise<Recorder> {
  const requests: Recorded[] = [];
  const server: Server = createServer((request, response) => {
    requests.push({ method: request.method ?? "GET", path: (request.url ?? "").split("?")[0] });
    request.resume();
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(respond(request)));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** MOCK ApiClient: counts calls at the boundary and forwards to the loopback recorder (rewriting only the origin). */
function createLoopbackApiClient(origin: string): ApiClient & { readonly calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async request(input, init) {
      const url = new URL(typeof input === "string" ? input : input.toString());
      calls.push(url.pathname);
      return fetch(`${origin}${url.pathname}${url.search}`, init as RequestInit);
    },
  };
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!predicate()) {
    if (Date.now() > deadline) assert.fail(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const noopLogger = { info() {}, warn() {} };

// ───────────── Main: rollouts and help config ─────────────

test("Main rollouts under Graph policy return the default snapshot without any request, timer or first-host wait", async () => {
  const recorder = await startRecorder();
  try {
    let fetches = 0;
    const fetchConfig = async (signal: AbortSignal) => {
      fetches += 1;
      return (await fetch(`${recorder.origin}/api/v1/client/configs`, { signal })).json();
    };
    const prompt = createDesktopContextPromptRollout({
      fetchConfig,
      logger: noopLogger,
      automaticFetchAllowed: GRAPH.desktopRollout,
    });
    const trace = createRendererActionTraceRollout({
      fetchConfig,
      logger: noopLogger,
      automaticFetchAllowed: GRAPH.desktopRollout,
    });
    mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
    try {
      // awaitFirstDecision(2000) must resolve immediately with the default; a pending timer would never fire under mock timers.
      assert.deepEqual(await prompt.awaitFirstDecision(2_000), { enabled: false });
      assert.deepEqual(await prompt.refresh(), { enabled: false });
      assert.equal((await trace.awaitFirstDecision(2_000)).enabled, false);
      mock.timers.tick(3 * 60 * 60 * 1_000); // far past the 1 h TTL and the 3 s timeout
      assert.deepEqual(await prompt.refresh(), { enabled: false });
      assert.equal((await trace.refresh()).enabled, false);
    } finally {
      mock.timers.reset();
    }
    assert.equal(fetches, 0);
    assert.equal(recorder.requests.length, 0);
  } finally {
    await recorder.close();
  }
});

test("positive control: Production and Preview policy rollouts do reach the loopback endpoint", async () => {
  for (const policy of [PRODUCTION, PREVIEW]) {
    const recorder = await startRecorder();
    try {
      const prompt = createDesktopContextPromptRollout({
        fetchConfig: async (signal) =>
          (await fetch(`${recorder.origin}/api/v1/client/configs`, { signal })).json(),
        logger: noopLogger,
        automaticFetchAllowed: policy.desktopRollout,
      });
      assert.deepEqual(await prompt.refresh(), { enabled: true, configVersion: "synthetic-1" });
      assert.deepEqual(recorder.requests, [{ method: "GET", path: "/api/v1/client/configs" }]);
    } finally {
      await recorder.close();
    }
  }
});

test("Main help-config reader under Graph policy makes no request and the bundled default.json still resolves", async () => {
  const recorder = await startRecorder();
  try {
    let fetches = 0;
    const read = createDesktopHelpConfigReader({
      resolveEndpointOrigin: async () => recorder.origin,
      appVersion: "0.0.0-test",
      deviceMid: "synthetic-device",
      automaticFetchAllowed: GRAPH.helpConfig,
      fetchImpl: (async () => {
        fetches += 1;
        throw new Error("must not be called");
      }) as unknown as typeof fetch,
    });
    const remote = await read();
    assert.equal(remote, undefined);
    assert.equal(fetches, 0);
    assert.equal(recorder.requests.length, 0);
    // Existing contract: feedback/community resolve from the bundled config when no remote config exists.
    const bundled = JSON.parse(
      await readFile(join(import.meta.dirname, "../../../config/default.json"), "utf8"),
    );
    const resolved = resolveHelpAppConfig(remote, bundled);
    assert.equal(resolved.feedback_use_external_form, false);
    assert.ok(resolved.community_urls?.["en-US"] || resolved.community_urls?.["zh-CN"]);
  } finally {
    await recorder.close();
  }
});

test("positive control: Production policy help-config reader reaches the loopback endpoint", async () => {
  const recorder = await startRecorder();
  try {
    const read = createDesktopHelpConfigReader({
      resolveEndpointOrigin: async () => recorder.origin,
      appVersion: "0.0.0-test",
      deviceMid: "synthetic-device",
      automaticFetchAllowed: PRODUCTION.helpConfig,
      fetchImpl: (input, init) => fetch(input, init),
    });
    const remote = (await read()) as { feedback_url?: string };
    assert.equal(remote.feedback_url, "https://upstream.invalid/form");
    assert.deepEqual(recorder.requests, [{ method: "GET", path: "/api/v1/client/configs" }]);
  } finally {
    await recorder.close();
  }
});

// ───────────── Host: client configs and scenes ─────────────

test("Host client config under Graph policy returns the default snapshot with no request, context lookup or cache", async () => {
  const recorder = await startRecorder();
  try {
    const api = createLoopbackApiClient(recorder.origin);
    let contextLookups = 0;
    const service = createClientConfigService({
      apiClient: api,
      automaticNetworkPolicy: GRAPH,
      resolveRequestContext: () => {
        contextLookups += 1;
        return { endpointOrigin: recorder.origin, appVersion: "0.0.0-test", platform: "linux-x64" };
      },
    });
    mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
    try {
      assert.deepEqual(await service.getSnapshot(), { pluginStoreOrder: null });
      assert.deepEqual(await service.getSnapshot({}), { pluginStoreOrder: null });
      assert.deepEqual(await service.getSnapshot({ forceRefresh: false }), {
        pluginStoreOrder: null,
      });
      mock.timers.tick(3 * 60 * 60 * 1_000);
      assert.deepEqual(await service.getSnapshot(), { pluginStoreOrder: null });
    } finally {
      mock.timers.reset();
    }
    assert.equal(api.calls.length, 0);
    assert.equal(contextLookups, 0);
    assert.equal(recorder.requests.length, 0);
  } finally {
    await recorder.close();
  }
});

test("explicit path stays reachable: forceRefresh (Plugin Store refresh button) reaches the loopback endpoint under Graph policy", async () => {
  const recorder = await startRecorder();
  try {
    const service = createClientConfigService({
      apiClient: createLoopbackApiClient(recorder.origin),
      automaticNetworkPolicy: GRAPH,
      resolveRequestContext: () => ({
        endpointOrigin: recorder.origin,
        appVersion: "0.0.0-test",
        platform: "linux-x64",
      }),
    });
    const snapshot = await service.getSnapshot({ forceRefresh: true });
    assert.deepEqual(snapshot.pluginStoreOrder?.code?.categoryOrder, ["from-server"]);
    assert.equal(recorder.requests.length, 1);
  } finally {
    await recorder.close();
  }
});

test("positive control: Production policy client config fetches on a plain read and then serves the cache", async () => {
  const recorder = await startRecorder();
  try {
    const service = createClientConfigService({
      apiClient: createLoopbackApiClient(recorder.origin),
      automaticNetworkPolicy: PRODUCTION,
      resolveRequestContext: () => ({
        endpointOrigin: recorder.origin,
        appVersion: "0.0.0-test",
        platform: "linux-x64",
      }),
    });
    const first = await service.getSnapshot();
    assert.deepEqual(first.pluginStoreOrder?.code?.categoryOrder, ["from-server"]);
    await service.getSnapshot();
    assert.equal(recorder.requests.length, 1);
  } finally {
    await recorder.close();
  }
});

test("Host client scenes: Graph returns empty bundled scenes with no request; Production reaches the loopback endpoint", async () => {
  const recorder = await startRecorder();
  try {
    const graphApi = createLoopbackApiClient(recorder.origin);
    const graph = createClientScenesService({ apiClient: graphApi, automaticNetworkPolicy: GRAPH });
    assert.deepEqual(await graph.list(), { code: 0, msg: "bundled-default", data: [] });
    assert.equal(graphApi.calls.length, 0);
    assert.equal(recorder.requests.length, 0);

    const productionApi = createLoopbackApiClient(recorder.origin);
    const production = createClientScenesService({
      apiClient: productionApi,
      automaticNetworkPolicy: PRODUCTION,
    });
    const response = await production.list();
    assert.equal(response.data[0]?.scene, "from-server");
    assert.deepEqual(recorder.requests, [{ method: "GET", path: "/api/v1/client/scenes" }]);
  } finally {
    await recorder.close();
  }
});

// ───────────── Host/agent shared runtime: built-in provider catalog ─────────────

async function withBuiltinRuntime(
  policy: AutomaticNetworkPolicy,
  body: (context: {
    runtime: ReturnType<typeof createNodeProviderConfigRuntime>;
    fetchReleaseCalls: () => number;
    recorder: Recorder;
  }) => Promise<void>,
): Promise<void> {
  const recorder = await startRecorder();
  const dir = await mkdtemp(join(tmpdir(), "z83n1-provider-"));
  let calls = 0;
  const runtime = createNodeProviderConfigRuntime({
    // Bundled snapshot fixture: the repository's own shipped catalog (read-only).
    zcodeBuiltinFilePath: join(import.meta.dirname, "../../../config/provider/zcode-builtin.json"),
    zcodeBuiltinActiveFilePath: join(dir, "active.json"),
    personalFilePath: join(dir, "provider_config.json"),
    personalPollingIntervalMs: false,
    watch: false,
    automaticZCodeBuiltinRefresh: policy.builtinProviderCatalog,
    zcodeBuiltinRemote: {
      controlFilePath: join(dir, "control.json"),
      resolveEndpointKey: () => recorder.origin,
      // MOCK fetchRelease that performs a real loopback request, so a restored download shows up in the recorder.
      fetchRelease: async () => {
        calls += 1;
        await fetch(`${recorder.origin}/builtin-release`);
        return null;
      },
    },
  });
  try {
    await body({ runtime, fetchReleaseCalls: () => calls, recorder });
  } finally {
    mock.timers.reset();
    runtime.dispose();
    await recorder.close();
    await rm(dir, { recursive: true, force: true });
  }
}

test("built-in provider sync under Graph policy: bundled catalog readable, no download at start, none after timers or retries", async () => {
  await withBuiltinRuntime(GRAPH, async ({ runtime, fetchReleaseCalls, recorder }) => {
    let recoveryRuns = 0;
    runtime.onDidCheckZCodeBuiltin(async () => {
      recoveryRuns += 1;
    });
    mock.timers.enable({ apis: ["setInterval"] });
    await runtime.start(); // must not hang
    const snapshot = await runtime.configService.read();
    assert.ok(
      snapshot.zcodeBuiltinRevision.length > 0 && snapshot.zcodeBuiltinProviders,
      "bundled catalog is usable",
    );
    await waitFor(() => recoveryRuns >= 1, "the local recovery check");
    for (let minute = 0; minute < 180; minute += 1) mock.timers.tick(60_000);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(fetchReleaseCalls(), 0);
    assert.equal(recorder.requests.length, 0);
    assert.ok(recoveryRuns > 1, "local recovery listeners keep running on the periodic check");
  });
});

test("explicit path stays reachable: refreshZCodeBuiltin({ force: true }) downloads under Graph policy", async () => {
  await withBuiltinRuntime(GRAPH, async ({ runtime, fetchReleaseCalls, recorder }) => {
    await runtime.start();
    assert.equal(fetchReleaseCalls(), 0);
    assert.equal(await runtime.refreshZCodeBuiltin({ force: true }), "missing");
    assert.equal(fetchReleaseCalls(), 1);
    assert.deepEqual(recorder.requests, [{ method: "GET", path: "/builtin-release" }]);
  });
});

test("positive control: Production policy built-in sync downloads in the background after start", async () => {
  await withBuiltinRuntime(PRODUCTION, async ({ runtime, fetchReleaseCalls, recorder }) => {
    await runtime.start();
    await waitFor(() => fetchReleaseCalls() >= 1, "the background built-in download");
    assert.deepEqual(recorder.requests, [{ method: "GET", path: "/builtin-release" }]);
  });
});

// ───────────── Z8.3-W1: automatic callers that were labelled as explicit or were never covered ─────────────
// 打包的 Graph 应用在冷启动时实测发出两个自动 /api/v1/client/configs 请求：
//  1) Root 启动调用 providerSettingsService.refresh("root-provider-state-refresh")，经 refreshSources 以 force: true 触发 Built-in 目录下载；
//  2) Host 启动时读取动态工作流灰度配置（coding-plan 提供者的 getClientConfigs）。
// 下面的测试固定修复后的语义：只有设置页“刷新”（settings-manual）和 forceRefresh 是显式路径。

async function withProviderRuntime(
  policy: typeof GRAPH,
  body: (context: {
    runtime: ReturnType<typeof createProviderRuntime>;
    fetchReleaseCalls: () => number;
    recorder: Recorder;
  }) => Promise<void>,
): Promise<void> {
  const recorder = await startRecorder();
  const dir = await mkdtemp(join(tmpdir(), "z83w1-provider-runtime-"));
  let calls = 0;
  const runtime = createProviderRuntime({
    zcodeBuiltinFilePath: join(import.meta.dirname, "../../../config/provider/zcode-builtin.json"),
    zcodeBuiltinActiveFilePath: join(dir, "active.json"),
    personalFilePath: join(dir, "provider_config.json"),
    personalPollingIntervalMs: false,
    watch: false,
    automaticZCodeBuiltinRefresh: policy.builtinProviderCatalog,
    zcodeBuiltinRemote: {
      controlFilePath: join(dir, "control.json"),
      resolveEndpointKey: () => recorder.origin,
      // MOCK fetchRelease that performs a real loopback request so that a restored download shows up in the recorder.
      fetchRelease: async () => {
        calls += 1;
        await fetch(`${recorder.origin}/builtin-release`);
        return null;
      },
    },
  });
  try {
    await body({ runtime, fetchReleaseCalls: () => calls, recorder });
  } finally {
    runtime.dispose();
    await recorder.close();
    await rm(dir, { recursive: true, force: true });
  }
}

test("Root-style provider refresh is automatic: under Graph policy it never downloads the built-in catalog, the settings refresh button still does", async () => {
  await withProviderRuntime(GRAPH, async ({ runtime, fetchReleaseCalls, recorder }) => {
    await runtime.start();
    for (const reason of [
      "root-provider-state-refresh",
      "oauth-restore-entitlement",
      "account-connection-switched",
    ])
      await runtime.providerSettings.refresh(reason);
    assert.equal(fetchReleaseCalls(), 0, "automatic callers must not reach the downloader");
    assert.deepEqual(recorder.requests, []);
    await runtime.providerSettings.refresh("settings-manual"); // the Provider Settings refresh button
    assert.equal(fetchReleaseCalls(), 1, "the explicit button keeps the download path");
    assert.deepEqual(recorder.requests, [{ method: "GET", path: "/builtin-release" }]);
  });
});

test("positive control: under Production policy the same Root-style refresh still downloads (force) exactly as before", async () => {
  await withProviderRuntime(PRODUCTION, async ({ runtime, fetchReleaseCalls, recorder }) => {
    await runtime.start();
    await runtime.providerSettings.refresh("root-provider-state-refresh");
    assert.ok(fetchReleaseCalls() >= 1);
    assert.ok(recorder.requests.some((request) => request.path === "/builtin-release"));
  });
});

test("coding-plan automatic client-config reads (dynamic workflow, Off-Peak) make no request under Graph policy; forceRefresh and Production do", async () => {
  const recorder = await startRecorder();
  try {
    const make = (policy: typeof GRAPH) =>
      new BigModelCodingPlanSubscriptionProvider({
        apiClient: createLoopbackApiClient(recorder.origin),
        credentialService: { load: async () => null } as never,
        automaticNetworkPolicy: policy,
      });
    const graph = make(GRAPH);
    const closed = await graph.getDynamicWorkflowClientConfig();
    assert.equal(closed.source, "default");
    await graph.getOffPeakClientConfig();
    assert.deepEqual(recorder.requests, [], "Graph: no automatic request");
    await graph.getDynamicWorkflowClientConfig({ forceRefresh: true });
    assert.equal(
      recorder.requests.filter((request) => request.path === "/api/v1/client/configs").length,
      1,
      "forceRefresh is the explicit path",
    );
    recorder.requests.length = 0;
    await make(PRODUCTION).getDynamicWorkflowClientConfig();
    assert.equal(
      recorder.requests.filter((request) => request.path === "/api/v1/client/configs").length,
      1,
      "positive control: Production reads the remote config",
    );
  } finally {
    await recorder.close();
  }
});

// ───────────── Unchanged: user-selected model traffic ─────────────

test("a user-selected model request to the same loopback origin works while automatic classes are denied (no hostname logic)", async () => {
  const recorder = await startRecorder();
  try {
    // The Host client-config service is pointed at the same origin as the "model endpoint" fixture.
    const service = createClientConfigService({
      apiClient: createLoopbackApiClient(recorder.origin),
      automaticNetworkPolicy: GRAPH,
      resolveRequestContext: () => ({
        endpointOrigin: recorder.origin,
        appVersion: "0.0.0-test",
        platform: "linux-x64",
      }),
    });
    assert.deepEqual(await service.getSnapshot(), { pluginStoreOrder: null });
    assert.equal(recorder.requests.length, 0);

    // The real Host ApiClient (same one the model/provider paths use) reaches that origin.
    const reply = await createNodeApiClient().request(`${recorder.origin}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(((await reply.json()) as { id: string }).id, "synthetic-model-reply");
    assert.deepEqual(recorder.requests, [{ method: "POST", path: "/v1/chat/completions" }]);
  } finally {
    await recorder.close();
  }
});

// ───────────── Feedback ─────────────

interface FeedbackFixture {
  readonly recorder: Recorder;
  readonly api: ApiClient & { readonly calls: string[] };
  readonly spies: { credentialLoads: number; archives: number; deviceMidReads: number };
  readonly dataDir: string;
  create(flavor: "graph" | "production"): ReturnType<typeof createFeedbackService>;
  dispose(): Promise<void>;
}

async function createFeedbackFixture(): Promise<FeedbackFixture> {
  const recorder = await startRecorder();
  const dataDir = await mkdtemp(join(tmpdir(), "z83n1-feedback-"));
  setDataBaseDir(dataDir);
  const api = createLoopbackApiClient(recorder.origin);
  const spies = { credentialLoads: 0, archives: 0, deviceMidReads: 0 };
  return {
    recorder,
    api,
    spies,
    dataDir,
    create: (flavor) =>
      createFeedbackService({
        flavor,
        apiClient: api,
        apiBaseUrl: `${recorder.origin}/api/v1`,
        // MOCK credential service: a synthetic token (no account); counts reads.
        credentialService: {
          load: async () => {
            spies.credentialLoads += 1;
            return "synthetic-token";
          },
        } as never,
        oauthService: {} as never,
        getDeviceMid: () => {
          spies.deviceMidReads += 1;
          return "synthetic-device";
        },
        createFullLogArchive: async () => {
          spies.archives += 1;
          return { path: join(dataDir, "synthetic.zip"), size: 1 };
        },
      }),
    dispose: async () => {
      setDataBaseDir(null);
      await recorder.close();
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

test("Feedback service under Graph refuses every submission/upload method before any side effect", async () => {
  const fixture = await createFeedbackFixture();
  try {
    const service = fixture.create("graph");
    const progress: unknown[] = [];
    const subscription = service.onDynamicUploadProgress("progress-1")((event) =>
      progress.push(event),
    );
    const file = { path: join(fixture.dataDir, "attachment.bin"), filename: "a.bin" };
    const attempts: Array<[string, () => Promise<unknown>]> = [
      [
        "create",
        () =>
          service.create(
            { title: "synthetic", description: "synthetic", type: "bug" },
            { operationId: "op-1" },
          ),
      ],
      ["comment", () => service.comment("SYNTH-1", "synthetic")],
      ["uploadAttachment", () => service.uploadAttachment("SYNTH-1", "image", file)],
      [
        "uploadAttachmentWithProgress",
        () => service.uploadAttachmentWithProgress("SYNTH-1", "image", file, "progress-1"),
      ],
      [
        "uploadAttachmentData",
        () =>
          service.uploadAttachmentData("SYNTH-1", "image", {
            dataBase64: "AA==",
            filename: "a.png",
            contentType: "image/png",
          }),
      ],
      ["attachLogsFromExport", () => service.attachLogsFromExport("SYNTH-1", { full: true })],
      [
        "prepareCompactLogArchive",
        () => service.prepareCompactLogArchive({ full: true, progressId: "progress-1" }),
      ],
    ];
    for (const [name, attempt] of attempts) {
      await assert.rejects(attempt, FeedbackSubmissionDisabledError, `${name} must be refused`);
    }
    subscription.dispose();
    assert.equal(
      fixture.recorder.requests.length,
      0,
      "no ticket, upload-credential or object-storage request",
    );
    assert.equal(fixture.api.calls.length, 0, "the ApiClient boundary is never reached");
    assert.equal(fixture.spies.credentialLoads, 0, "no token read");
    assert.equal(fixture.spies.deviceMidReads, 0);
    assert.equal(fixture.spies.archives, 0, "no log archive prepared");
    assert.deepEqual(progress, [], "no progress event");
    await assert.rejects(
      access(join(fixture.dataDir, "feedback")),
      "no attachment staging directory",
    );
  } finally {
    await fixture.dispose();
  }
});

test("positive control: Feedback service under Production creates a ticket against the loopback endpoint", async () => {
  const fixture = await createFeedbackFixture();
  try {
    const ticket = await fixture
      .create("production")
      .create({ title: "synthetic", description: "synthetic", type: "bug" });
    assert.equal(ticket.id, "SYNTH-1");
    assert.deepEqual(fixture.recorder.requests, [
      { method: "POST", path: "/api/v1/feedback/ticket" },
    ]);
  } finally {
    await fixture.dispose();
  }
});
