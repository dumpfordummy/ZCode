// UX-M1.4 journey E (states): the six maintained reviewer scenarios, run for real, and what the real
// run detail shows for each in English and Simplified Chinese. The maintained driver reviewer-native.mjs
// keeps the strict semantic assertions; this journey adds the visible, localized classification.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { root } from "./isolation.mjs";
import { instantiateReviewer } from "./reviewer-native-ui.mjs";
import { startNativeTemplate } from "./z6-native-ui.mjs";
import { driveUntil, showGraph } from "./z5-native-observe.mjs";
import { SCENARIOS } from "./reviewer-native-responses.mjs";
import { T, finishReceipt, launchUx, observe, shot, step } from "./ux-m1-native-common.mjs";

const HAN = /[一-鿿]/;
// What each scenario must classify as (graphRunResult): only invalid reviewer output and a failed
// Test are failures; a valid reviewer decision (pass, needs_changes, needs_human) is not.
const EXPECTED = {
  pass: { kind: "none", human: "waiting" },
  needs_changes: { kind: "none", human: "waiting" },
  needs_human: { kind: "none", human: "waiting" },
  "prose-fence": { kind: "reviewer-output-invalid", human: "not-requested" },
  "unbound-report": { kind: "reviewer-output-invalid", human: "not-requested" },
  "test-failure": { kind: "test-failed", human: "not-requested" },
};

async function oneScenario(scenario, locale, observed) {
  // 维护中的驱动按英文标签 “Allow” 回答原生权限，所以总是先用英文跑完；zh-CN 则在运行结束后
  // 用同一个私有 profile 以 zh-CN 重新启动，读取真实持久化的运行详情。
  let { isolation, window, receipt } = await launchUx(`states-${locale}-${scenario}`, {
    scenario,
    locale: "en-US",
  });
  const summary = { assertions: [], screenshots: [] };
  let error;
  try {
    await step(receipt, "S1", `${scenario}: real run reaches its outcome`, async () => {
      await instantiateReviewer(isolation, window, summary, false);
      await startNativeTemplate(isolation, window, summary);
      await driveUntil(isolation, window, summary, (value) =>
        ["Failed", "WaitingForApproval", "NeedsHuman"].includes(value.status),
      );
    });
    if (locale === "zh-CN")
      await step(
        receipt,
        "S1b",
        `${scenario}: reopen the same profile in Simplified Chinese`,
        async () => {
          await isolation.stopApp();
          const settingPath = path.join(isolation.home, "home/.zcode/v2/setting.json");
          const setting = JSON.parse(await readFile(settingPath, "utf8"));
          await writeFile(settingPath, JSON.stringify({ ...setting, localePreference: "zh-CN" }));
          window = await isolation.launch({
            bootstrapEntry: path.join(root, "scripts/graph-engineering/ux-m1-native-bootstrap.cjs"),
          });
        },
      );
    await step(receipt, "S2", `${scenario}: the run detail classifies it`, async () => {
      await showGraph(window);
      await T(window, "graph-run").first().click();
      await T(window, "graph-run-summary").waitFor();
      const block = T(window, "graph-run-result-block");
      const kind = (await block.count()) ? await block.getAttribute("data-kind") : "none";
      const text = (await T(window, "graph-run-summary").innerText()).replace(/\s+/g, " ").trim();
      const human = await T(window, "graph-run-human")
        .getAttribute("data-state")
        .catch(() => null);
      observe(receipt, `${scenario} (${locale}) classification`, { kind, human });
      observed.push({ scenario, locale, kind, human, text: text.slice(0, 600) });
      assert.equal(kind, EXPECTED[scenario].kind, `${scenario}: result kind`);
      if (locale === "zh-CN") assert.match(text, HAN, `${scenario}: UI-owned labels are localized`);
      // 原始诊断与 id 不翻译：check id 与请求文字保持原样。
      assert.ok(text.includes("Modify zz-demo.txt file content to after"));
      await shot(isolation, window, receipt, `state-${locale}-${scenario}`, [1280, 720]);
    });
  } catch (caught) {
    error = caught;
  } finally {
    await finishReceipt(receipt, isolation, window, error);
  }
}

/** Runs every scenario; a failing scenario does not stop the others, but the exit code is non-zero. */
export async function statesJourney(locale) {
  const observed = [];
  for (const scenario of SCENARIOS) await oneScenario(scenario, locale, observed);
  const kinds = new Set(observed.map((row) => row.kind));
  console.error(
    JSON.stringify({ locale, observed: observed.map(({ text: _text, ...row }) => row) }),
  );
  // 三类不同的可见结果：有效决定（none）、无效 reviewer 输出、失败的 Test。
  if (observed.length === SCENARIOS.length)
    assert.equal(kinds.size, 3, "three distinct classifications");
}
