import assert from "node:assert/strict";
import test from "node:test";
import { resolveAutomaticTelemetryPolicy } from "@zcode/shared";
import { buildAgentTelemetrySpawnEnv } from "../src/zcode-agent/agentTelemetryEnv.js";

const inherited = {
  ZCODE_TELEMETRY_REPORT_ENDPOINT: "https://report.synthetic.invalid/ingest",
  ZCODE_ARMS_RUM_ENDPOINT: "https://rum.synthetic.invalid/ingest",
};
const otlp = {
  OTEL_EXPORTER_OTLP_ENDPOINT: "https://otlp.synthetic.invalid",
  OTEL_EXPORTER_OTLP_HEADERS: "authorization=Bearer synthetic-canary",
};

test("inherited telemetry endpoints cannot enable automatic telemetry for the Graph flavor", () => {
  assert.deepEqual(resolveAutomaticTelemetryPolicy("graph", inherited), {
    enabled: false,
    reportEndpoint: "",
    armsRumEndpoint: "",
  });
});

test("ordinary ZCode flavors keep their previous telemetry behavior", () => {
  for (const flavor of ["production", "preview"] as const) {
    assert.deepEqual(resolveAutomaticTelemetryPolicy(flavor, inherited), {
      enabled: true,
      reportEndpoint: inherited.ZCODE_TELEMETRY_REPORT_ENDPOINT,
      armsRumEndpoint: inherited.ZCODE_ARMS_RUM_ENDPOINT,
    });
    assert.deepEqual(resolveAutomaticTelemetryPolicy(flavor, {}), {
      enabled: true,
      reportEndpoint: "",
      armsRumEndpoint: "",
    });
  }
});

test("the agent process never receives OTLP settings in the Graph flavor, and still does elsewhere", () => {
  const graph = buildAgentTelemetrySpawnEnv({
    telemetryEnv: otlp,
    deviceMid: "synthetic-device",
    userId: "synthetic-user",
    runtimeSurface: "desktop_local_host",
    flavor: "graph",
  });
  assert.deepEqual(graph, {});
  const ordinary = buildAgentTelemetrySpawnEnv({
    telemetryEnv: otlp,
    deviceMid: "synthetic-device",
    runtimeSurface: "desktop_local_host",
    flavor: "production",
  });
  assert.equal(ordinary.OTEL_EXPORTER_OTLP_ENDPOINT, otlp.OTEL_EXPORTER_OTLP_ENDPOINT);
  assert.equal(ordinary.ZCODE_TELEMETRY_RUNTIME_SURFACE, "desktop_local_host");
});
