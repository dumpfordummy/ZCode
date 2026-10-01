import {
  ZCODE_NATIVE_CONTRACT_KEY,
  ZCODE_PROTOCOL_NAME,
  ZCODE_PROTOCOL_VERSION,
  zcodeNativeContractFeatures,
  zcodeNativeContractSchema,
  zcodeProtocolMethods,
} from "@zcode/shared";
import {
  V4_METHODS,
  V4_WIRE_PROTOCOL_VERSION,
  type CommandType,
} from "@zcode/shared/zcode-protocol-v4";

/**
 * Graph 需要的最小原生运行时（唯一权威描述）。名字取自协议常量而不是字符串字面量：上游改名或
 * 删除时先在类型检查处失败，而不是在运行中途失败。命令名用 `CommandType` 约束。
 */
export const GRAPH_NATIVE_REQUIREMENTS = {
  protocol: {
    name: ZCODE_PROTOCOL_NAME,
    version: ZCODE_PROTOCOL_VERSION,
    v4WireVersion: V4_WIRE_PROTOCOL_VERSION,
  },
  sessionMethods: [
    zcodeProtocolMethods.sessionCreate,
    V4_METHODS.conversationSubscribe,
    V4_METHODS.command,
    zcodeProtocolMethods.workspaceUpdateInteractionPreferences,
  ],
  recipeMethods: [
    zcodeProtocolMethods.sessionRecipeStart,
    zcodeProtocolMethods.sessionRecipeInspect,
    zcodeProtocolMethods.sessionRecipeCancel,
  ],
  commands: ["sendText", "stop", "resolveInteraction"] satisfies CommandType[],
  features: [zcodeNativeContractFeatures.interactionProtectedSessions],
} as const;

export type GraphRuntimeFailureClass =
  | "capabilities-unavailable"
  | "capabilities-malformed"
  | "protocol-identity"
  | "protocol-version"
  | "wire-version"
  | "missing-method"
  | "missing-command"
  | "missing-feature"
  | "plan-state"
  | "probe-failed";

/** `expected` 来自固定需求集；`observed` 只含有界安全摘要，绝不回显运行时提供的列表。 */
export interface GraphRuntimeFailure {
  class: GraphRuntimeFailureClass;
  expected: string;
  observed: string;
}
export interface GraphRuntimeDiagnostic {
  failures: GraphRuntimeFailure[];
  omitted: number;
}
export type GraphRuntimeProbe =
  | { kind: "unsupported" }
  | { kind: "failed" }
  | { kind: "response"; value: unknown };
export type GraphRuntimeVerdict =
  | { compatible: true }
  | { compatible: false; diagnostic: GraphRuntimeDiagnostic };

const MAX_FAILURES = 8;
const MESSAGE_FAILURES = 2;
const SAFE_TEXT = /^[A-Za-z0-9 ._-]{1,48}$/;
const INVALID = "<invalid>";
const safeText = (value: unknown) =>
  typeof value === "string" && SAFE_TEXT.test(value) ? value : INVALID;
const safeInteger = (value: unknown) => (Number.isSafeInteger(value) ? String(value) : INVALID);

export function evaluateGraphNativeRuntime(probe: GraphRuntimeProbe): GraphRuntimeVerdict {
  const failures: GraphRuntimeFailure[] = [];
  const fail = (failure: GraphRuntimeFailure) => failures.push(failure);
  const required = GRAPH_NATIVE_REQUIREMENTS;
  const capabilities = `runtime/capabilities.${ZCODE_NATIVE_CONTRACT_KEY}`;
  const raw =
    probe.kind === "response" && typeof probe.value === "object" && probe.value !== null
      ? (probe.value as Record<string, unknown>)
      : undefined;
  if (probe.kind === "failed")
    fail({
      class: "probe-failed",
      expected: zcodeProtocolMethods.runtimeCapabilities,
      observed: "no response",
    });
  else if (probe.kind === "unsupported" || (raw && !(ZCODE_NATIVE_CONTRACT_KEY in raw)))
    fail({ class: "capabilities-unavailable", expected: capabilities, observed: "absent" });
  else if (!raw)
    fail({ class: "capabilities-malformed", expected: capabilities, observed: "unreadable" });
  if (raw && ZCODE_NATIVE_CONTRACT_KEY in raw) {
    const parsed = zcodeNativeContractSchema.safeParse(raw[ZCODE_NATIVE_CONTRACT_KEY]);
    if (!parsed.success)
      fail({ class: "capabilities-malformed", expected: capabilities, observed: "unreadable" });
    else {
      const contract = parsed.data;
      if (contract.protocol.name !== required.protocol.name)
        fail({
          class: "protocol-identity",
          expected: required.protocol.name,
          observed: safeText(contract.protocol.name),
        });
      if (contract.protocol.version !== required.protocol.version)
        fail({
          class: "protocol-version",
          expected: String(required.protocol.version),
          observed: safeInteger(contract.protocol.version),
        });
      if (contract.protocol.v4WireVersion !== required.protocol.v4WireVersion)
        fail({
          class: "wire-version",
          expected: String(required.protocol.v4WireVersion),
          observed: safeInteger(contract.protocol.v4WireVersion),
        });
      const missing = (
        kind: GraphRuntimeFailureClass,
        names: readonly string[],
        available: readonly string[],
      ) => {
        for (const name of names)
          if (!available.includes(name)) fail({ class: kind, expected: name, observed: "absent" });
      };
      missing(
        "missing-method",
        [...required.sessionMethods, ...required.recipeMethods],
        contract.methods,
      );
      missing("missing-command", required.commands, contract.commands);
      missing("missing-feature", required.features, contract.features);
    }
  }
  // 计划状态是已有能力：缺失（旧 agent）与显式 false 同样不兼容，且独立于 nativeContract 是否存在。
  if (raw && raw.independentPlanState !== true)
    fail({
      class: "plan-state",
      expected: "independentPlanState=true",
      observed:
        raw.independentPlanState === undefined
          ? "absent"
          : typeof raw.independentPlanState === "boolean"
            ? String(raw.independentPlanState)
            : INVALID,
    });
  return failures.length
    ? {
        compatible: false,
        diagnostic: {
          failures: failures.slice(0, MAX_FAILURES),
          omitted: Math.max(0, failures.length - MAX_FAILURES),
        },
      }
    : { compatible: true };
}

/** 准入失败：Graph 未启动、无记录、无 native session；与 Test 失败和审阅证据无关。 */
export class GraphRuntimeIncompatibleError extends Error {
  override readonly name = "GraphRuntimeIncompatible";
  constructor(readonly diagnostic: GraphRuntimeDiagnostic) {
    const shown = diagnostic.failures
      .slice(0, MESSAGE_FAILURES)
      .map((f) => `${f.class}: expected ${f.expected}, observed ${f.observed}`)
      .join("; ");
    const more = diagnostic.failures.length - MESSAGE_FAILURES + diagnostic.omitted;
    super(
      `Graph was not started: the native agent runtime is not compatible with this Graph build (${shown}${more > 0 ? `; +${more} more` : ""}). ` +
        "Nothing was run, and no agent was downloaded, replaced or retried. Use a ZCode Graph build whose native agent matches it.",
    );
  }
}
