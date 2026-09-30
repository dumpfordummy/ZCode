// UX-M1.1 browser scenarios: prepare the next task while a run occupies the workspace.
import assert from "node:assert/strict";
import { addByKeyboard } from "./context-picker-helpers.mjs";
import {
  T,
  admissionCalls,
  assertClean,
  boot,
  drafts,
  finished,
  flush,
  navigation,
  SIZES,
  setState,
  shot,
  started,
  until,
} from "./ux-m1-helpers.mjs";
import { approvalWaitRun, permissionWaitRun, questionWaitRun, runningRun } from "./ux-m1-runs.mjs";

const TEMPLATE_KEY = "agent-assisted:1";
const draftOf = async (page, host, workspace = "A") =>
  (await drafts(page))[host.workspaces[workspace]]?.templates[TEMPLATE_KEY];

const waits = [
  ["a native permission", permissionWaitRun],
  ["a native question", questionWaitRun],
  ["the final human approval", approvalWaitRun],
];

const drafted = async (page, host, request = "Prepare the next task") => {
  await T(page, "graph-template-parameter-request").fill(request);
  await addByKeyboard(page, "Context", "instructions");
};

const draftingWhileWaiting = waits.map(([label, makeRun]) => ({
  name: `draft while a run waits for ${label}: the form is editable and every admission action is refused`,
  async run({ page, host, url }) {
    const current = makeRun();
    host.setRuns("A", [current]);
    const captured = structuredClone(host.graph.A.runs);
    await boot(page, host, url);
    const request = T(page, "graph-template-parameter-request");
    assert.equal(
      await request.isDisabled(),
      false,
      "the request is editable while a run occupies the workspace",
    );
    await request.fill("Prepare the next task");
    await addByKeyboard(page, "Context", "instructions");
    // 草稿写入 store，而不是别处
    const draft = await draftOf(page, host);
    assert.equal(draft.parameters.request, "Prepare the next task");
    assert.equal(draft.bindings.references.instructions, "docs/Context.md");
    // 原因与「查看当前运行」紧挨主操作；同一句话不在页面顶部再出现一次
    const blocked = T(page, "graph-new-run-blocked");
    assert.equal(await blocked.getAttribute("data-blocked-by"), "run-active");
    assert.match(await blocked.innerText(), /current run still owns this workspace/);
    assert.equal(await T(page, "graph-run-blocked-reason").count(), 0);
    await T(page, "graph-view-current-run").waitFor();
    assert.equal(await T(page, "graph-review-run").isDisabled(), true);
    assert.equal(await T(page, "graph-library-instantiate").isDisabled(), true);
    // 起草没有到达 Host 的任何准入类操作，捕获的运行也没有被改动
    assert.deepEqual(admissionCalls(host), []);
    assert.deepEqual(host.graph.A.runs, captured);
    assertClean(host);
  },
}));

const bypass = {
  name: "no path reaches admission while a run is unresolved: DOM bypass, keyboard, and the real hook called without any button",
  async run({ page, host, url }) {
    const current = permissionWaitRun();
    host.setRuns("A", [current]);
    await boot(page, host, url);
    await drafted(page, host);
    // 1) 绕过禁用样式：React 按 props 吞掉禁用按钮上的点击，所以直接调用该元素的 onClick 处理函数，
    //    模拟任何「备用控件」。处理函数自身（以及其后的每一层）都必须拒绝。
    for (const id of ["graph-review-run", "graph-library-instantiate"]) {
      const invoked = await page.evaluate((testId) => {
        const element = document.querySelector(`[data-testid="${testId}"]`);
        const key = Object.keys(element).find((name) => name.startsWith("__reactProps"));
        element[key].onClick({ preventDefault() {}, stopPropagation() {}, currentTarget: element });
        return true;
      }, id);
      assert.equal(invoked, true, `${id}: the onClick handler was invoked directly`);
    }
    // 2) 键盘：表单里没有任何一条键盘路径会实例化或开始运行
    await T(page, "graph-template-parameter-request").focus();
    for (const key of ["Enter", "Control+Enter", "Meta+Enter", "Alt+Enter"])
      await page.keyboard.press(key);
    await flush(page);
    assert.deepEqual(admissionCalls(host), [], "DOM bypass and keyboard reach nothing");
    // 3) 最低的 Renderer 路径：直接调用真实的 useGraphEngineering，不经过任何按钮
    await until(() => page.evaluate(() => Boolean(window.__probe?.view)), "probe view loaded");
    for (const name of ["run", "prepare", "checks"]) {
      const result = await page.evaluate(
        async ([which, definition]) => {
          const model = { providerId: "fixture", modelId: "fixture-model" };
          const graph = window.__probe;
          const fns = {
            run: () =>
              graph.run(definition, model, "build", false, true, {
                digest: "d".repeat(64),
                acknowledgedUnknowns: true,
              }),
            prepare: () =>
              graph.prepareRunConfirmation(definition, {
                modelSelection: model,
                mode: "build",
                planEnabled: false,
              }),
            checks: () => graph.runChecks({ definition }, true),
          };
          return (await fns[which]()) ?? null;
        },
        [name, host.graph.A.runs[0].definition],
      );
      assert.equal(result, null, `${name} is refused: no run or snapshot is returned`);
      await flush(page);
      // 每条路径各自被准入守卫拒绝（不是被别的原因）
      await until(
        async () =>
          /Graph admission is blocked: run run-permission is still unresolved/.test(
            String(await page.evaluate(() => window.__probe.error)),
          ),
        `${name} refused by the admission guard`,
      );
      await page.evaluate(() => window.__probe.reload());
    }
    assert.deepEqual(admissionCalls(host), [], "the hook refused before any Host operation");
    assert.equal(started(host, "graph.run").length, 0);
    assertClean(host);
  },
};

const navigationScenario = {
  name: "the draft survives the current run, Workflows, Checks and a workspace switch, and returns exactly",
  async run({ page, host, url }) {
    host.setRuns("A", [permissionWaitRun()]);
    await boot(page, host, url);
    await drafted(page, host, "Draft for workspace A");
    const snapshot = async () => {
      const draft = await draftOf(page, host);
      return { request: draft?.parameters.request, references: draft?.bindings.references };
    };
    const before = await snapshot();
    assert.equal(before.request, "Draft for workspace A");
    // 当前运行：由「查看当前运行」进入，捕获内容不变；再回到草稿
    await T(page, "graph-view-current-run").click();
    await T(page, "graph-run-verification").or(T(page, "graph-run-history")).first().waitFor();
    const key = host.workspaces.A;
    assert.equal((await navigation(page))[key].runId, "run-permission");
    assert.equal(await T(page, "graph-run").first().getAttribute("aria-current"), "true");
    await T(page, "graph-new-run").click();
    await T(page, "graph-template-parameter-request").waitFor();
    assert.equal(
      await T(page, "graph-template-parameter-request").inputValue(),
      "Draft for workspace A",
    );
    await T(page, "graph-context-chip-instructions").waitFor();
    // Workflows 与 Checks
    for (const destination of ["design", "setup"]) {
      await T(page, `graph-view-${destination}`).click();
      await flush(page);
      await T(page, "graph-view-runs").click();
      await T(page, "graph-new-run").click();
      await T(page, "graph-template-parameter-request").waitFor();
      assert.deepEqual(await snapshot(), before, `after visiting ${destination}`);
    }
    // 工作区切换：各自的草稿互不可见，回来时精确恢复
    await setState(page, { workspace: "B" });
    await T(page, "graph-new-run-pane").waitFor();
    await T(page, "graph-template-parameter-request").waitFor();
    assert.equal(
      await T(page, "graph-template-parameter-request").inputValue(),
      "",
      "B starts empty",
    );
    assert.equal(await T(page, "graph-view-current-run").count(), 0, "B has no occupying run");
    await T(page, "graph-template-parameter-request").fill("Draft for workspace B");
    await setState(page, { workspace: "A" });
    await T(page, "graph-template-parameter-request").waitFor();
    assert.equal(
      await T(page, "graph-template-parameter-request").inputValue(),
      "Draft for workspace A",
    );
    assert.deepEqual(await snapshot(), before);
    assert.equal((await draftOf(page, host, "B")).parameters.request, "Draft for workspace B");
    assert.deepEqual(admissionCalls(host), []);
    assertClean(host);
  },
};

const noAutoStart = {
  name: "when the current run resolves nothing starts: no instantiate, preflight or Start; Review is explicit and needs a fresh, unacknowledged review",
  async run({ page, host, url }) {
    host.setRuns("A", [approvalWaitRun()]);
    await boot(page, host, url);
    await drafted(page, host, "Add null check to the parser");
    const draft = await draftOf(page, host);
    assert.equal(await T(page, "graph-review-run").isDisabled(), true);
    // 当前运行结束（Host 投影变化）
    host.resolveRuns("A");
    await until(async () => (await T(page, "graph-new-run-blocked").count()) === 0, "block lifted");
    await until(async () => !(await T(page, "graph-review-run").isDisabled()), "Review available");
    // 什么都没有自动发生
    await new Promise((resolve) => setTimeout(resolve, 600));
    await flush(page);
    assert.deepEqual(
      admissionCalls(host),
      [],
      "resolution alone triggers no instantiate, save, preflight or run",
    );
    assert.equal(
      await T(page, "graph-run-confirmation").count(),
      0,
      "no review was opened for the user",
    );
    // 显式 Review：实例化负载等于草稿，然后是全新的预检
    await T(page, "graph-review-run").click();
    await T(page, "graph-run-confirmation").waitFor();
    const instantiate = started(host, "wf.instantiate");
    assert.equal(instantiate.length, 1);
    assert.equal(instantiate[0].parameters.request, "Add null check to the parser");
    assert.deepEqual(
      instantiate[0].bindings,
      draft.bindings,
      "the payload is the draft the user prepared",
    );
    assert.equal(started(host, "wf.prepare").length, 1);
    assert.equal(
      await T(page, "graph-preflight-ack").getAttribute("aria-checked"),
      "false",
      "acknowledgment starts unchecked",
    );
    assert.equal(await T(page, "graph-confirm-run").isDisabled(), true);
    assert.equal(started(host, "graph.run").length, 0, "nothing starts until the user does");
    // 显式确认并 Start
    await T(page, "graph-preflight-ack").click();
    await T(page, "graph-confirm-run").click();
    await until(() => started(host, "graph.run").length === 1, "explicit Start");
    const run = started(host, "graph.run")[0];
    assert.equal(run.preflight.acknowledgedUnknowns, true);
    assert.match(run.preflight.digest, /^[0-9a-f]{64}$/);
    assertClean(host);
  },
};

const capturedUnchanged = {
  name: "drafting does not change the captured run: its request, evidence and definition are identical afterwards",
  async run({ page, host, url }) {
    const run = runningRun("run-capture");
    host.setRuns("A", [run]);
    await boot(page, host, url);
    const before = structuredClone(host.graph.A.runs);
    await drafted(page, host, "A completely different request");
    await T(page, "graph-view-current-run").click();
    await T(page, "graph-run-request-preview").first().waitFor();
    assert.match(
      await T(page, "graph-run-request-preview").first().innerText(),
      /Captured request of the current run/,
    );
    assert.doesNotMatch(await page.locator("body").innerText(), /completely different request/);
    assert.deepEqual(host.graph.A.runs, before);
    assert.deepEqual(finished(host, "graph.saveDefinition"), []);
    assertClean(host);
  },
};

const screenshots = {
  name: "screenshots: draft prepared while a run waits (1280x720 and 1920x1080, dark and light)",
  async run({ page, host, url, shotsDir }) {
    if (!shotsDir) return;
    host.setRuns("A", [permissionWaitRun()]);
    await boot(page, host, url);
    await drafted(page, host, "Add a null check to the request parser");
    for (const size of SIZES) {
      await page.setViewportSize(size);
      await T(page, "graph-new-run-blocked").scrollIntoViewIfNeeded();
      await shot(page, shotsDir, "m1-draft-while-running", size);
    }
    await setState(page, { theme: "zai-light" });
    await page.setViewportSize(SIZES[0]);
    await T(page, "graph-new-run-blocked").scrollIntoViewIfNeeded();
    await shot(page, shotsDir, "m1-draft-while-running-light", SIZES[0]);
    assertClean(host);
  },
};

export const draftingScenarios = [
  ...draftingWhileWaiting,
  bypass,
  navigationScenario,
  noAutoStart,
  capturedUnchanged,
  screenshots,
];
