import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import {
  resolveDesktopProductIdentity,
  resolveDesktopProductFlavor,
  resolveWindowsAppUserModelIdForFlavor,
  resolveGraphDistributionVersion,
} from "../../packages/desktop/scripts/desktop-product-identity.mjs";
import { createGraphProfile } from "../../packages/desktop/scripts/graph-profile.mjs";

test("Graph is a distinct opt-in flavor and leaves ordinary build identities unchanged", () => {
  const graph = resolveDesktopProductIdentity({
    ZCODE_GRAPH_DISTRIBUTION: "1",
    ZCODE_ENV: "production",
  });
  assert.equal(graph.productName, "ZCode Graph");
  assert.equal(graph.flavor, "graph");
  assert.equal(resolveWindowsAppUserModelIdForFlavor("graph"), graph.appId);
  assert.notEqual(graph.appId, resolveDesktopProductIdentity({ ZCODE_ENV: "production" }).appId);
  assert.equal(resolveDesktopProductFlavor({ ZCODE_ENV: "production" }), "production");
  assert.equal(resolveDesktopProductFlavor({ ZCODE_ENV: "test" }), "preview");
  assert.equal(
    resolveDesktopProductFlavor({ ZCODE_ENV: "production", ZCODE_PREVIEW_IDENTITY: "1" }),
    "preview",
  );
  assert.throws(() => resolveDesktopProductFlavor({ ZCODE_GRAPH_DISTRIBUTION: "yes" }));
});

test("private profile overrides inherited ZCode paths and remains stable across app relaunch", () => {
  const user = path.resolve("synthetic-user");
  const profile = createGraphProfile(user, {
    HOME: user,
    USERPROFILE: user,
    ZCODE_DATA_BASE_DIR: "old-installation",
    ZCODE_HOME: "old-credentials",
    ZCODE_DESKTOP_USER_DATA_DIR: "old-electron",
  });
  assert.equal(profile.root, path.join(user, ".zcode-graph-engineering"));
  for (const key of [
    "HOME",
    "USERPROFILE",
    "ZCODE_HOME",
    "ZCODE_STORAGE_DIR",
    "ZCODE_DATA_BASE_DIR",
    "ZCODE_DESKTOP_HOME_DIR",
    "ZCODE_DESKTOP_USER_DATA_DIR",
    "ZCODE_DESKTOP_SESSION_DATA_DIR",
  ])
    assert.ok(profile.env[key].startsWith(profile.root + path.sep), key);
  assert.deepEqual(createGraphProfile(profile.env.USERPROFILE, profile.env), profile);
  assert.equal(profile.env.PATH, undefined);
});

test("Graph release version is explicit and cannot change ordinary package versions", () => {
  assert.equal(
    resolveGraphDistributionVersion(
      { ZCODE_GRAPH_DISTRIBUTION: "1", ZCODE_GRAPH_VERSION: "3.14.0-z7.1" },
      "3.14.0",
    ),
    "3.14.0-z7.1",
  );
  assert.equal(
    resolveGraphDistributionVersion(
      { ZCODE_GRAPH_DISTRIBUTION: "1", ZCODE_GRAPH_VERSION: "3.14.0-z2.1" },
      "3.14.0",
    ),
    "3.14.0-z2.1",
  );
  for (const version of [
    "3.14.0-z3.1",
    "3.14.3-z4.1",
    "3.14.3-z5.1",
    "3.14.3-z6.1",
    "3.14.3-z9.1",
    "3.14.3-z10.1",
    "3.14.3-z18.1",
    "3.14.3-z8.01",
    "3.14.3-z8",
    "3.14.3-Z8.1",
    "3.14.0-z7.01",
    "03.14.0-z2.1",
    "3.14.0-z2.01",
    "3.14.0-z2.1;echo",
    "3.14.0",
  ]) {
    assert.throws(() =>
      resolveGraphDistributionVersion(
        { ZCODE_GRAPH_DISTRIBUTION: "1", ZCODE_GRAPH_VERSION: version },
        "3.14.0",
      ),
    );
  }
  for (const version of ["3.14.3-z8.1", "3.14.3-z8.0", "3.14.3-z8.12", "3.14.3-z1.2", "3.14.3-z2.2", "3.14.3-z7.5"])
    assert.equal(
      resolveGraphDistributionVersion(
        { ZCODE_GRAPH_DISTRIBUTION: "1", ZCODE_GRAPH_VERSION: version },
        "3.14.3",
      ),
      version,
    );
  assert.equal(
    resolveGraphDistributionVersion(
      { ZCODE_GRAPH_DISTRIBUTION: "1", ZCODE_GRAPH_VERSION: "3.14.0-z1.1" },
      "3.14.0",
    ),
    "3.14.0-z1.1",
  );
  assert.equal(
    resolveGraphDistributionVersion({ ZCODE_GRAPH_VERSION: "9.0.0" }, "3.14.0"),
    "3.14.0",
  );
  assert.throws(() => resolveGraphDistributionVersion({ ZCODE_GRAPH_DISTRIBUTION: "1" }, "3.14.0"));
  assert.throws(() =>
    resolveGraphDistributionVersion(
      { ZCODE_GRAPH_DISTRIBUTION: "1", ZCODE_GRAPH_VERSION: "../invalid" },
      "3.14.0",
    ),
  );
});

test("Graph entry scrubs every inherited automatic-telemetry setting before application import", async () => {
  const { graphAutomaticTelemetryEnv } = await import(
    "../../packages/desktop/scripts/graph-profile.mjs"
  );
  const inherited = {
    ZCODE_ARMS_RUM_ENDPOINT: "https://rum.synthetic.invalid/x",
    ZCODE_TELEMETRY_REPORT_ENDPOINT: "https://report.synthetic.invalid/x",
    OTEL_EXPORTER_OTLP_ENDPOINT: "https://otlp.synthetic.invalid",
    otel_exporter_otlp_traces_headers: "authorization=Bearer synthetic-canary",
    ZCODE_TELEMETRY_DEVICE_MID: "synthetic-device",
    ZCODE_MODEL_TELEMETRY_ENABLED: "1",
    PATH: "C:\\Windows",
    ZCODE_ENV: "production",
  };
  const policy = graphAutomaticTelemetryEnv(inherited);
  assert.deepEqual(policy.remove.sort(), [
    "OTEL_EXPORTER_OTLP_ENDPOINT",
    "ZCODE_ARMS_RUM_ENDPOINT",
    "ZCODE_TELEMETRY_DEVICE_MID",
    "ZCODE_TELEMETRY_REPORT_ENDPOINT",
    "otel_exporter_otlp_traces_headers",
  ]);
  assert.deepEqual(policy.set, { ZCODE_MODEL_TELEMETRY_ENABLED: "0" });
  assert.deepEqual(graphAutomaticTelemetryEnv({}).remove, []);
});
