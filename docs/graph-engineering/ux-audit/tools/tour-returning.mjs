// Returning-user journey：已保存 Build/Test checks、真实 native 执行、受控 loopback 模型。
// 只观察与截图；权限一律通过既有 native "Allow once" 路径逐条放行，不绕过。
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createIsolation } from "../../../../scripts/graph-engineering/isolation.mjs";
import { startZ6Fixture } from "../../../../scripts/graph-engineering/z6-provider-fixture.mjs";
import {
  reviewerNativeResponse,
  SCENARIOS,
} from "../../../../scripts/graph-engineering/reviewer-native-responses.mjs";
import {
  prepareReviewerFixture,
  REQUEST,
} from "../../../../scripts/graph-engineering/reviewer-native-fixture.mjs";
import {
  readGraphRecord,
  selectNode,
  selectValue,
  showGraph,
} from "../../../../scripts/graph-engineering/z5-native-observe.mjs";
import { approveNativePermissionOnce } from "../../../../scripts/graph-engineering/native-permission.mjs";
import { shot, visibleTestIds, auditRoot } from "./audit-common.mjs";

const scenario = process.argv.find((a) => a.startsWith("--scenario="))?.slice(11) ?? "pass";
if (!SCENARIOS.includes(scenario)) throw new Error(`unknown scenario ${scenario}`);
const p = `rt-${scenario}`;
const isolation = await createIsolation({
  fixtureFactory: (workspace) => startZ6Fixture(workspace, scenario, reviewerNativeResponse),
});
const notes = { scenario, steps: [] };
const step = (name, extra = {}) => notes.steps.push({ name, at: Date.now(), ...extra });
let window;
const panelText = () => window.getByTestId("graph-engineering-panel").innerText();
try {
  await prepareReviewerFixture(isolation);
  window = await isolation.launch();
  await window.getByTestId("graph-engineering-open").click();
  await window.getByTestId("graph-engineering-panel").waitFor();
  await shot(isolation, window, `${p}-01-landing-with-saved-checks`, [[1280, 720]]);
  step("landing", { text: await panelText(), ids: await visibleTestIds(window) });

  await window.getByTestId("graph-view-workflows").click();
  await selectValue(window, "graph-library-entry", "generic");
  await window.getByTestId("graph-template-parameter-request").fill(REQUEST);
  await shot(isolation, window, `${p}-02-workflows-request-typed`, [[1280, 720]]);
  step("workflows-typed", { text: await panelText() });
  await window.getByTestId("graph-template-load-recipes").click();
  await window.locator('[data-testid="graph-recipe-read-state"][data-state="ready"]').waitFor();
  const refs = window.getByTestId("graph-reference-bindings");
  if ((await refs.getAttribute("open")) === null) await refs.locator(":scope > summary").click();
  for (const details of await window
    .getByTestId("graph-template-reference-instructions")
    .locator("xpath=ancestor::details")
    .all())
    if ((await details.getAttribute("open")) === null)
      await details.locator(":scope > summary").click();
  await window.getByTestId("graph-template-reference-instructions").fill("Context.md");
  await shot(isolation, window, `${p}-03-workflows-context-open`, [[1280, 720]]);
  await selectValue(window, "graph-template-recipe-build", "reviewer-build");
  await selectValue(window, "graph-template-recipe-test", "reviewer-test");
  await window.getByTestId("graph-library-instantiate").click();
  await window.getByTestId("graph-name").waitFor();
  await window.getByTestId("graph-view-workflows").click();
  await window.getByTestId("graph-workflow-summary").waitFor();
  await shot(isolation, window, `${p}-04-workflows-instantiated`, [
    [1280, 720],
    [1920, 1080],
  ]);
  step("workflows-instantiated", { text: await panelText() });

  await window.getByTestId("graph-view-design").click();
  await window.getByTestId("graph-name").waitFor();
  await shot(isolation, window, `${p}-05-design`, [
    [1280, 720],
    [1920, 1080],
  ]);
  step("design", { text: await panelText() });
  await window.getByTestId("graph-view-workflows").click();

  // 预检
  await window.getByTestId("graph-workflow-run").click();
  await window.getByTestId("graph-run-confirmation").waitFor({ timeout: 30000 });
  await shot(isolation, window, `${p}-06-preflight`, [
    [1280, 720],
    [1920, 1080],
  ]);
  step("preflight", { text: await window.getByTestId("graph-run-confirmation").innerText() });
  await window.getByTestId("graph-preflight-ack").setChecked(true);
  await window.getByTestId("graph-confirm-run").click();
  await showGraph(window);

  const handled = new Set();
  const seenStatus = new Set();
  const deadline = Date.now() + 180000;
  let run;
  while (Date.now() < deadline) {
    run = (await readGraphRecord(isolation)).runs.at(-1);
    if (run) {
      const tag = `${run.status}:${run.currentNodeId ?? ""}`;
      if (!seenStatus.has(tag) && run.status === "Running") {
        seenStatus.add(tag);
        if (seenStatus.size <= 2) {
          await showGraph(window);
          await shot(isolation, window, `${p}-07-running-${seenStatus.size}`, [[1280, 720]]);
          step("running", { tag, text: await panelText() });
        }
      }
      if (["Failed", "WaitingForApproval", "NeedsHuman", "Completed"].includes(run.status)) break;
      const pending = [...run.nodeAttempts, ...(run.toolAttempts ?? [])].find(
        (a) => a.status === "WaitingForPermission" && !handled.has(a.attemptId),
      );
      if (pending) {
        handled.add(pending.attemptId);
        await showGraph(window);
        const label = `${p}-08-wait-${pending.nodeId}`;
        const sizes = [[1280, 720], ...(pending.nodeId === "build" ? [[1920, 1080]] : [])];
        await shot(isolation, window, `${label}-runs`, sizes);
        step("permission-wait-runs-view", { node: pending.nodeId, text: await panelText() });
        await selectNode(window, pending.nodeId);
        await selectValue(window, "graph-attempt-select", pending.attemptId);
        await window.getByTestId("graph-open-conversation").click();
        await window
          .locator(
            `[data-testid^="v4-session-pane"][data-session-id="${pending.sessionId}"]:visible`,
          )
          .waitFor();
        await window
          .getByRole("option", { name: "Allow", exact: true })
          .waitFor({ timeout: 30000 });
        await shot(isolation, window, `${label}-conversation`, sizes);
        step("permission-conversation", {
          node: pending.nodeId,
          text: await window.locator("body").innerText(),
        });
        await approveNativePermissionOnce(window);
        await showGraph(window);
      }
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  notes.finalStatus = run?.status;
  await showGraph(window);
  await window.waitForTimeout(800);
  await shot(isolation, window, `${p}-09-final-runs`, [
    [1280, 720],
    [1920, 1080],
  ]);
  step("final-runs", { text: await panelText(), ids: await visibleTestIds(window) });
  await window.getByTestId("graph-engineering-panel").evaluate((el) => {
    const scroller = [...el.querySelectorAll("*")].find(
      (n) => n.scrollHeight > n.clientHeight + 40 && getComputedStyle(n).overflowY !== "visible",
    );
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  });
  await shot(isolation, window, `${p}-10-final-runs-scrolled`, [[1280, 720]]);
} catch (error) {
  notes.error = error.stack ?? String(error);
  if (window) await shot(isolation, window, `${p}-error`).catch(() => {});
} finally {
  await writeFile(
    path.join(auditRoot, "tools", `returning-notes-${scenario}.json`),
    JSON.stringify(notes, null, 2),
  );
  await isolation.close();
  console.log(notes.error ?? "ok", notes.finalStatus, isolation.home);
}
