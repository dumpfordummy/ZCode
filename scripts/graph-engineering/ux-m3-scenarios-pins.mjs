// UX-M3.3 browser scenarios: Open in Runs, and historical pins that the library no longer offers.
import assert from "node:assert/strict";
import { assertClean, drafts } from "./ux-m1-helpers.mjs";
import {
  T,
  boot,
  callsOf,
  librarySelection,
  mutationCalls,
  openLibrary,
} from "./ux-m3-helpers.mjs";
import { pinnedRun } from "./ux-m3-pins.mjs";

const RUN_ID = "run-historical-v1";
const runAgain = async (page) => {
  await page.locator(`[data-testid="graph-run"][data-run-id="${RUN_ID}"]`).click();
  await T(page, "graph-run-again").click();
  await T(page, "graph-new-run-pane").waitFor();
};

// CHARACTERIZATION (UX-M3.3, written before any fix): what the UI does today when Run again is used on
// a run pinned to a built-in version the Host no longer offers. It asserts today's observed facts.
const reproduction = {
  name: "REPRODUCTION (before the M3.3 fix): Run again on a run pinned to an unavailable built-in version silently shows the offered version with the seeded values unreachable",
  async run({ page, host, url }) {
    const offered = host.library.versionOf("agent-assisted");
    assert.notEqual(offered, 1, "the Host offers the corrected built-in, not version 1");
    host.setRuns("A", [pinnedRun(RUN_ID)]);
    const before = structuredClone(host.graph.A.runs);
    await boot(page, host, url);
    await runAgain(page);
    // 选择被写成不存在的版本 1 …
    assert.deepEqual(await librarySelection(page, host), { id: "agent-assisted", version: 1 });
    // … 但页面静默显示当前提供的版本 …
    assert.equal(
      await T(page, "graph-new-run-version-line").innerText(),
      `This run will use Agent-assisted task · Version ${offered} · Built-in`,
    );
    // … 历史请求被放在无人显示的键 agent-assisted:1 下，可见表单是空的，也没有任何说明。
    const templates = (await drafts(page))[host.workspaces.A].templates;
    assert.equal(
      templates["agent-assisted:1"].parameters.request,
      "Historical request from the captured run",
    );
    assert.equal(await T(page, "graph-template-parameter-request").inputValue(), "");
    assert.equal(await T(page, "graph-historical-pin").count(), 0, "no notice of any kind");
    assert.deepEqual(host.graph.A.runs, before, "the historical run is untouched");
    assertClean(host);
  },
};

export const pinScenarios = [reproduction];
