// UX-M4.4 native captures and structure checks on the FINAL Desktop build: the real Host, a real
// native session, the controlled loopback provider and a disposable workspace. It adds the states the
// UX-M4.1 baseline did not capture (New run while a run waits, run tabs, Checks, the design canvas and
// node inspector, a final approval) and asserts the structure the Focus-page system promises.
//   node scripts/graph-engineering/ux-m4-native.mjs [--journey=states|approval]
// Functional evidence only: the visual judgement belongs to the user.
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { instantiateReviewer } from "./reviewer-native-ui.mjs";
import { startNativeTemplate } from "./z6-native-ui.mjs";
import { driveUntil } from "./z5-native-observe.mjs";
import { root } from "./isolation.mjs";
import {
  T,
  finishReceipt,
  launchUx,
  pendingPermission,
  prepareNewRun,
  shotSizes,
  startFromNewRun,
  step,
  waitRecord,
} from "./ux-m3-native-common.mjs";

const journey = process.argv.find((arg) => arg.startsWith("--journey="))?.slice(10) ?? "states";
const THEMES = ["zai-dark", "zai-light"];

async function setTheme(window, theme) {
  await window.evaluate((value) => localStorage.setItem("zcode-theme", value), theme);
  // A reload can land on the welcome screen first once a run exists; retry, then fail for real.
  for (let attempt = 1; ; attempt += 1) {
    await window.reload();
    await window.waitForLoadState("domcontentloaded");
    try {
      await T(window, "graph-engineering-open")
        .or(T(window, "graph-engineering-panel"))
        .first()
        .waitFor({ timeout: 20000 });
      return;
    } catch (error) {
      if (attempt >= 3) throw error;
    }
  }
}
async function eachTheme(window, name, prepare, isolation, receipt) {
  for (const theme of THEMES) {
    await setTheme(window, theme);
    await prepare();
    await shotSizes(isolation, window, receipt, `${name}-${theme.slice(4)}`);
  }
}
const openRuns = async (window) => {
  if (!(await T(window, "graph-engineering-panel").isVisible()))
    await T(window, "graph-engineering-open").click();
  await T(window, "graph-view-runs").click();
};
const toTop = (window) =>
  window.evaluate(() =>
    document.querySelectorAll("*").forEach((el) => {
      if (el.scrollTop > 0) el.scrollTop = 0;
    }),
  );
const toBottom = (window) =>
  window.evaluate(() => {
    const view = document.querySelector("[data-view]");
    if (view) view.scrollTop = view.scrollHeight;
  });
const launch = async (journeyName, options) => {
  const launched = await launchUx(journeyName, options);
  launched.receipt.evidenceDir = path.join(
    root,
    ".tmp/m4-evidence",
    `${journeyName}-${path.basename(launched.isolation.home)}`,
  );
  await mkdir(launched.receipt.evidenceDir, { recursive: true });
  return launched;
};

async function statesJourney() {
  const { isolation, window, receipt } = await launch("m4-native-states", {
    scenario: "pass",
    theme: "zai-dark",
  });
  let error;
  try {
    await step(receipt, "S1", "Start a run and wait for its native permission", async () => {
      await openRuns(window);
      await startFromNewRun(isolation, window);
      await waitRecord(isolation, pendingPermission, "the native permission wait");
    });
    await step(
      receipt,
      "S2",
      "New run while a run waits: Review is blocked, the draft stays",
      async () => {
        await eachTheme(
          window,
          "new-run-occupied",
          async () => {
            await openRuns(window);
            await T(window, "graph-new-run").click();
            await prepareNewRun(window, "Modify zz-demo.txt file content to after (next task)");
            await T(window, "graph-new-run-blocked").waitFor();
            assert.equal(await T(window, "graph-review-run").isDisabled(), true);
            assert.equal(await T(window, "graph-new-run-ready").count(), 0);
            assert.equal(
              await T(window, "graph-new-run-blocked").getAttribute("data-blocked-by"),
              "run-active",
            );
            await T(window, "graph-view-current-run").waitFor();
            await toTop(window);
          },
          isolation,
          receipt,
        );
      },
    );
    await step(
      receipt,
      "S3",
      "Run banner: permission stated once, one primary action, tabs",
      async () => {
        await openRuns(window);
        await window.locator('[data-testid="graph-run"]').first().click();
        await T(window, "graph-run-summary").waitFor();
        const summary = (await T(window, "graph-run-summary").innerText()).replace(/\s+/g, " ");
        const help =
          summary.match(/Answer the permission in this exact native conversation/g) ?? [];
        assert.equal(help.length, 1, "the permission sentence appears once");
        assert.equal(await T(window, "graph-run-banner").getAttribute("data-tone"), "warning");
        assert.equal(
          await T(window, "graph-run-banner").locator('[data-variant="default"]').count(),
          1,
        );
        await eachTheme(
          window,
          "run-banner-steps",
          async () => {
            await openRuns(window);
            await window.locator('[data-testid="graph-run"]').first().click();
            await T(window, "graph-run-tab-steps").click();
            await toBottom(window);
          },
          isolation,
          receipt,
        );
        await T(window, "graph-run-tab-evidence").click();
        await eachTheme(
          window,
          "run-evidence",
          async () => {
            await openRuns(window);
            await window.locator('[data-testid="graph-run"]').first().click();
            await T(window, "graph-run-tab-evidence").click();
            await toBottom(window);
          },
          isolation,
          receipt,
        );
      },
    );
    await step(receipt, "S4", "Checks destination with its list and the editor", async () => {
      await eachTheme(
        window,
        "checks",
        async () => {
          await openRuns(window);
          await T(window, "graph-view-setup").click();
          await T(window, "graph-return-bar")
            .or(T(window, "graph-recipe-list"))
            .first()
            .waitFor({ timeout: 15000 })
            .catch(() => undefined);
          await toTop(window);
        },
        isolation,
        receipt,
      );
    });
    await step(receipt, "S5", "Workflows: canvas and the node inspector", async () => {
      await eachTheme(
        window,
        "design",
        async () => {
          await openRuns(window);
          await T(window, "graph-view-design").click();
          await window.locator('[data-testid^="graph-select-node-"]').first().click();
          await toTop(window);
        },
        isolation,
        receipt,
      );
    });
    await step(
      receipt,
      "S6",
      "Disclosure stacks: the run technical/step inspector and the Workflows inspector",
      async () => {
        const open = async (id) => {
          const summary = T(window, id).locator(":scope > summary");
          if ((await T(window, id).count()) && !(await T(window, id).evaluate((n) => n.open)))
            await summary.click();
        };
        await eachTheme(
          window,
          "disclosures-run",
          async () => {
            await openRuns(window);
            await window.locator('[data-testid="graph-run"]').first().click();
            await T(window, "graph-run-tab-steps").click();
            await window.locator('[data-testid^="graph-select-node-"]').first().click();
            for (const id of [
              "graph-routing-iterations",
              "graph-routing-checkpoints",
              "graph-frozen-provenance",
            ])
              await open(id);
            const technical = window
              .locator("summary", { hasText: "Technical identities and captured facts" })
              .first();
            if (await technical.count()) await technical.click();
            // 冻结来源：标题只在披露区头部出现一次，嵌入内容没有重复标题
            if (await T(window, "graph-frozen-provenance").count()) {
              const box = T(window, "graph-frozen-provenance");
              assert.equal(
                await box.getByText("Frozen workflow provenance", { exact: true }).count(),
                1,
              );
              assert.equal(
                await box.locator('[data-testid="graph-workflow-provenance"] h3').count(),
                0,
              );
            }
            // 披露行是我们自己的行：没有浏览器默认三角，行高不小于 36px
            const rows = await window
              .locator('[data-testid="graph-routing-iterations"] > summary')
              .evaluate((node) => {
                const style = getComputedStyle(node);
                return { list: style.listStyleType, height: node.getBoundingClientRect().height };
              });
            assert.equal(rows.list, "none");
            assert.ok(rows.height >= 36);
            await window.evaluate(() => {
              const node = document.querySelector('[data-testid="graph-routing-iterations"]');
              node?.scrollIntoView({ block: "start" });
            });
          },
          isolation,
          receipt,
        );
        await eachTheme(
          window,
          "disclosures-workflows",
          async () => {
            await openRuns(window);
            await T(window, "graph-view-design").click();
            for (const id of [
              "graph-default-configuration",
              "graph-routing-settings",
              "graph-guided-repair",
              "graph-repeat-request",
            ])
              await open(id);
            await window.evaluate(() => {
              const node = document.querySelector('[data-testid="graph-default-configuration"]');
              node?.scrollIntoView({ block: "start" });
            });
          },
          isolation,
          receipt,
        );
      },
    );
  } catch (caught) {
    error = caught;
  } finally {
    await finishReceipt(receipt, isolation, window, error);
  }
}

async function approvalJourney() {
  const { isolation, window, receipt } = await launch("m4-native-approval", {
    scenario: "pass",
    theme: "zai-dark",
  });
  const summary = { assertions: [], screenshots: [] };
  let error;
  try {
    await step(receipt, "A1", "A real run that reaches its final human approval", async () => {
      await instantiateReviewer(isolation, window, summary, false);
      await startNativeTemplate(isolation, window, summary);
      await driveUntil(isolation, window, summary, (value) =>
        ["WaitingForApproval", "Failed", "NeedsHuman"].includes(value.status),
      );
      await openRuns(window);
      await window.locator('[data-testid="graph-run"]').first().click();
      await T(window, "graph-run-summary").waitFor();
      assert.equal(await T(window, "graph-run-banner").getAttribute("data-tone"), "warning");
      assert.equal(
        await T(window, "graph-run-review-gate").getAttribute("data-variant"),
        "default",
      );
      await eachTheme(
        window,
        "run-approval",
        async () => {
          await openRuns(window);
          await window.locator('[data-testid="graph-run"]').first().click();
          await T(window, "graph-run-summary").waitFor();
          await toTop(window);
        },
        isolation,
        receipt,
      );
    });
    await step(
      receipt,
      "A2",
      "Open the approval from the banner: one bar with Approve and Reject",
      async () => {
        await eachTheme(
          window,
          "approval-inspect",
          async () => {
            await openRuns(window);
            await window.locator('[data-testid="graph-run"]').first().click();
            await T(window, "graph-run-review-gate").click();
            await T(window, "graph-approval-request").waitFor({ timeout: 20000 });
            const commit = T(window, "graph-approval-commit");
            assert.equal(await commit.locator('[data-testid="graph-approval-approve"]').count(), 1);
            assert.equal(await commit.locator('[data-testid="graph-approval-reject"]').count(), 1);
            assert.equal(await T(window, "graph-approval-approve").count(), 1);
            await toBottom(window);
          },
          isolation,
          receipt,
        );
      },
    );
  } catch (caught) {
    error = caught;
  } finally {
    await finishReceipt(receipt, isolation, window, error);
  }
}

if (journey === "approval") await approvalJourney();
else await statesJourney();
