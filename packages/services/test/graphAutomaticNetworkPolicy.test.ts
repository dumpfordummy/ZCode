// Z8.3-N1 policy tests plus SOURCE-TEXT GUARDS.
// The first group exercises the pure policy owner and the Host->agent env builder (real behavior).
// The "source-text guard" group only asserts that wiring lines exist in files that cannot be imported under
// the portable CI runner (Electron Main entry, the CLI workspace whose dependencies are not built there, and
// the Host entry). A source guard is NOT a packaged-network measurement and does not prove runtime behavior.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  AUTOMATIC_NETWORK_CLASSES,
  ZCODE_AUTOMATIC_NETWORK_DENY_ENV,
  encodeAutomaticNetworkDeny,
  resolveAutomaticNetworkPolicy,
  resolveAutomaticNetworkPolicyFromEnv,
  resolveFeedbackSubmissionPolicy,
  type ZCodeProductFlavor,
} from "@zcode/shared";
import { buildAgentAutomaticNetworkEnv } from "../src/zcode-agent/agentNetworkPolicyEnv.js";

const repoRoot = join(import.meta.dirname, "../../..");
// Whitespace is collapsed so that formatter line wrapping cannot make a guard fail or pass spuriously.
const read = async (path: string) =>
  (await readFile(join(repoRoot, path), "utf8")).replace(/\s+/g, " ");

test("policy owner: Graph denies every automatic class; Production and Preview allow every class", () => {
  for (const name of AUTOMATIC_NETWORK_CLASSES) {
    assert.equal(resolveAutomaticNetworkPolicy("graph")[name], false, `graph denies ${name}`);
    assert.equal(
      resolveAutomaticNetworkPolicy("production")[name],
      true,
      `production allows ${name}`,
    );
    assert.equal(resolveAutomaticNetworkPolicy("preview")[name], true, `preview allows ${name}`);
  }
  assert.deepEqual([...AUTOMATIC_NETWORK_CLASSES].sort(), [
    "builtinProviderCatalog",
    "clientConfig",
    "clientScenes",
    "desktopRollout",
    "helpConfig",
    "pluginMarketplace",
  ]);
});

test("policy owner: an unknown or missing flavor denies (fail closed) and results are immutable", () => {
  for (const flavor of ["", "unknown", undefined] as unknown as ZCodeProductFlavor[]) {
    const policy = resolveAutomaticNetworkPolicy(flavor);
    for (const name of AUTOMATIC_NETWORK_CLASSES) assert.equal(policy[name], false);
    assert.equal(resolveFeedbackSubmissionPolicy(flavor).allowed, false);
  }
  assert.throws(() => {
    "use strict";
    (resolveAutomaticNetworkPolicy("graph") as Record<string, boolean>).clientConfig = true;
  }, TypeError);
});

test("Feedback policy distinguishes Graph from supported flavors", () => {
  assert.equal(resolveFeedbackSubmissionPolicy("graph").allowed, false);
  assert.equal(resolveFeedbackSubmissionPolicy("production").allowed, true);
  assert.equal(resolveFeedbackSubmissionPolicy("preview").allowed, true);
});

test("env transport: Graph round-trips to all-denied and non-Graph to nothing denied", () => {
  const graphValue = encodeAutomaticNetworkDeny(resolveAutomaticNetworkPolicy("graph"));
  assert.equal(graphValue.split(",").length, AUTOMATIC_NETWORK_CLASSES.length);
  const graph = resolveAutomaticNetworkPolicyFromEnv({
    [ZCODE_AUTOMATIC_NETWORK_DENY_ENV]: graphValue,
  });
  assert.deepEqual(graph, resolveAutomaticNetworkPolicy("graph"));
  assert.equal(encodeAutomaticNetworkDeny(resolveAutomaticNetworkPolicy("production")), "");
  assert.deepEqual(
    resolveAutomaticNetworkPolicyFromEnv({ [ZCODE_AUTOMATIC_NETWORK_DENY_ENV]: "" }),
    resolveAutomaticNetworkPolicy("production"),
  );
});

test("env transport: absent means a standalone process (nothing denied); a partial list denies only those; an unknown token denies everything", () => {
  assert.deepEqual(
    resolveAutomaticNetworkPolicyFromEnv({}),
    resolveAutomaticNetworkPolicy("production"),
  );
  const partial = resolveAutomaticNetworkPolicyFromEnv({
    [ZCODE_AUTOMATIC_NETWORK_DENY_ENV]: " pluginMarketplace , builtinProviderCatalog ",
  });
  assert.equal(partial.pluginMarketplace, false);
  assert.equal(partial.builtinProviderCatalog, false);
  assert.equal(partial.clientConfig, true);
  for (const bad of ["bogus", "pluginMarketplace,bogus", "ALL", "true"]) {
    assert.deepEqual(
      resolveAutomaticNetworkPolicyFromEnv({ [ZCODE_AUTOMATIC_NETWORK_DENY_ENV]: bad }),
      resolveAutomaticNetworkPolicy("graph"),
      `unknown value ${bad} denies all`,
    );
  }
});

test("Host->agent env: Graph spawn env carries every class as denied; non-Graph explicitly clears an inherited value", () => {
  const graphEnv = buildAgentAutomaticNetworkEnv("graph");
  assert.deepEqual(
    resolveAutomaticNetworkPolicyFromEnv(graphEnv),
    resolveAutomaticNetworkPolicy("graph"),
  );
  // Spawn env is layered over the inherited process env, so a hostile inherited value is overwritten by the Host's.
  const inheritedAllow = { [ZCODE_AUTOMATIC_NETWORK_DENY_ENV]: "" };
  assert.deepEqual(
    resolveAutomaticNetworkPolicyFromEnv({ ...inheritedAllow, ...graphEnv }),
    resolveAutomaticNetworkPolicy("graph"),
  );
  assert.deepEqual(buildAgentAutomaticNetworkEnv("production"), {
    [ZCODE_AUTOMATIC_NETWORK_DENY_ENV]: "",
  });
});

// ───────────── source-text guards (wiring only; labelled, not behavior) ─────────────

async function assertContains(path: string, needle: string): Promise<void> {
  assert.ok(
    (await read(path)).includes(needle.replace(/\s+/g, " ")),
    `${path} must contain: ${needle}`,
  );
}

test("source-text guard: Host entry wires the policy into provider sync and the agent spawn env", async () => {
  await assertContains(
    "packages/services/src/node.ts",
    "automaticZCodeBuiltinRefresh: resolveAutomaticNetworkPolicy(ZCODE_PRODUCT_FLAVOR)",
  );
  await assertContains("packages/services/src/node.ts", "...buildAgentAutomaticNetworkEnv(),");
  await assertContains("packages/services/src/node.ts", "createClientScenesService({ apiClient })");
});

test("source-text guard: Electron Main passes the policy decisions to the help-config reader and both rollouts", async () => {
  const main = await read("packages/desktop/src/main/index.ts");
  assert.match(
    main,
    /const automaticNetworkPolicy = resolveAutomaticNetworkPolicy\(ZCODE_PRODUCT_FLAVOR\)/,
  );
  assert.match(main, /automaticFetchAllowed: automaticNetworkPolicy\.helpConfig/);
  assert.equal(
    main.match(/automaticFetchAllowed: automaticNetworkPolicy\.desktopRollout/g)?.length,
    2,
    "both rollouts are gated",
  );
});

test("source-text guard: agent (CLI) built-in refresh and suggested-plugin marketplace refresh read the Host-sent policy", async () => {
  await assertContains(
    "apps/zcode-cli/packages/bootstrap/src/app/process-provider-registry-runtime.ts",
    "automaticZCodeBuiltinRefresh: resolveAutomaticNetworkPolicyFromEnv(env).builtinProviderCatalog",
  );
  const catalog = await read(
    "apps/zcode-cli/packages/bootstrap/src/zcode-protocol/plugin-reference-catalog.ts",
  );
  const gate = catalog.indexOf(
    "resolveAutomaticNetworkPolicyFromEnv(process.env).pluginMarketplace",
  );
  const refresh = catalog.indexOf("await Promise.race([refreshRequest");
  assert.ok(
    gate > 0 && refresh > gate,
    "the policy gate precedes the official marketplace refresh",
  );
});

test("source-text guard: Main refuses the Feedback command (including the upstream form URL) and hides the menu entry for Graph", async () => {
  const handlers = await read("packages/desktop/src/main/desktopCommandHandlers.ts");
  const guard = handlers.indexOf("resolveFeedbackSubmissionPolicy(ZCODE_PRODUCT_FLAVOR).allowed");
  const open = handlers.indexOf("await openFeedback(options.logger");
  assert.ok(guard > 0 && open > guard, "the Feedback guard precedes openFeedback");
  await assertContains(
    "packages/desktop/src/main/desktopApplicationMenu.ts",
    "resolveFeedbackSubmissionPolicy(ZCODE_PRODUCT_FLAVOR).allowed",
  );
});

test("source-text guard: every Feedback UI entry point is conditioned on FEEDBACK_SUBMISSION_AVAILABLE", async () => {
  for (const file of [
    "packages/ui/src/WorkspaceHelpMenuButton.tsx",
    "packages/ui/src/quickpick/quickPickCommands.ts",
    "packages/ui/src/ChatErrorBanner.tsx",
    "packages/ui/src/v4/SessionSubscriptionErrorPanel.tsx",
    "packages/ui/src/remote-connection/RemoteConnectionConnectingStep.tsx",
    "packages/ui/src/TaskActionMenuContent.tsx",
    "packages/ui/src/workspace-grouped-tasks/task-context-menu-content.tsx",
  ]) {
    const source = await read(file);
    assert.ok(
      /\?\s*\(|\?\s*<|&&|if \(FEEDBACK_SUBMISSION_AVAILABLE\)/.test(source) &&
        source.includes("FEEDBACK_SUBMISSION_AVAILABLE"),
      `${file} gates its Feedback entry`,
    );
  }
  // Direct openers of the store (task rows, header) are covered by the store-level refusal, tested in packages/ui/test.
  await assertContains(
    "packages/ui/src/feedback/feedbackStore.ts",
    "createFeedbackUiStore(FEEDBACK_SUBMISSION_AVAILABLE)",
  );
});
