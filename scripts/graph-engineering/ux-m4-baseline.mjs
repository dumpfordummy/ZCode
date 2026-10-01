// UX-M4.1 baseline: the CURRENT real Electron app in populated states (real Host, real native session,
// controlled loopback provider, disposable workspace), captured in both themes at both sizes. Nothing
// is changed; this is what the visual alternatives are compared with.
//   node scripts/graph-engineering/ux-m4-baseline.mjs
import path from "node:path";
import { addByKeyboard } from "./context-picker-helpers.mjs";
import { instantiateReviewer } from "./reviewer-native-ui.mjs";
import { startNativeTemplate } from "./z6-native-ui.mjs";
import { driveUntil } from "./z5-native-observe.mjs";
import { root } from "./isolation.mjs";
import {
  T,
  chooseEntry,
  closeLibrary,
  duplicateWorkflow,
  finishReceipt,
  launchUx,
  openLibrary,
  openShare,
  pendingPermission,
  pinDesign,
  prepareNewRun,
  shotSizes,
  startFromNewRun,
  step,
  waitRecord,
} from "./ux-m3-native-common.mjs";

const THEMES = ["zai-dark", "zai-light"];
async function setTheme(window, theme) {
  await window.evaluate((value) => localStorage.setItem("zcode-theme", value), theme);
  // After a reload the app may restore the Graph panel (no open button), and with a run already
  // waiting the welcome screen can appear first (observed on the UX-M4 final build; a second reload
  // returns to the workspace). Try a few times; a page that never comes back is a real failure.
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

async function mainJourney() {
  const { isolation, window, receipt } = await launchUx("m4-baseline", {
    scenario: "pass",
    theme: "zai-dark",
  });
  receipt.evidenceDir = path.join(root, ".tmp/m4-evidence", path.basename(receipt.evidenceDir));
  const { mkdir } = await import("node:fs/promises");
  await mkdir(receipt.evidenceDir, { recursive: true });
  let error;
  try {
    await step(receipt, "B1", "New run, real-shaped: request, context, saved checks", async () => {
      await eachTheme(
        window,
        "new-run",
        async () => {
          await openRuns(window);
          await prepareNewRun(window);
          await addByKeyboard(window, "Notes", "instructions");
          // The screenshot shows the top of the pane, as a user arriving on New run sees it.
          await window.evaluate(() =>
            document.querySelectorAll("*").forEach((el) => {
              if (el.scrollTop > 0) el.scrollTop = 0;
            }),
          );
        },
        isolation,
        receipt,
      );
    });
    await step(
      receipt,
      "B2",
      "Workflow library with a selected workflow and two versions",
      async () => {
        await setTheme(window, "zai-dark");
        await openLibrary(window);
        const mine = await duplicateWorkflow(window, isolation, "generic", "Team release flow");
        await closeLibrary(window);
        await pinDesign(window, isolation, mine.id);
        await openLibrary(window);
        await openShare(window);
        await T(window, "graph-library-capture").click();
        await T(window, "graph-save-reviewed").click();
        await T(window, "graph-save-confirm").click();
        await T(window, "graph-library-result").waitFor({ timeout: 30000 });
        await closeLibrary(window);
        await eachTheme(
          window,
          "library",
          async () => {
            await openLibrary(window);
            await chooseEntry(window, mine.id);
          },
          isolation,
          receipt,
        );
      },
    );
    await step(receipt, "B3", "Run detail waiting for a native permission", async () => {
      await setTheme(window, "zai-dark");
      await openRuns(window);
      await startFromNewRun(isolation, window);
      await waitRecord(isolation, pendingPermission, "the native permission wait");
      await eachTheme(
        window,
        "run-waiting",
        async () => {
          await openRuns(window);
          await window.locator('[data-testid="graph-run"]').first().click();
          await T(window, "graph-run-summary").waitFor();
        },
        isolation,
        receipt,
      );
    });
  } catch (caught) {
    error = caught;
  } finally {
    await finishReceipt(receipt, isolation, window, error);
  }
}

async function failureJourney() {
  const { isolation, window, receipt } = await launchUx("m4-baseline-failure", {
    scenario: "test-failure",
    theme: "zai-dark",
  });
  receipt.evidenceDir = path.join(root, ".tmp/m4-evidence", path.basename(receipt.evidenceDir));
  const { mkdir } = await import("node:fs/promises");
  await mkdir(receipt.evidenceDir, { recursive: true });
  const summary = { assertions: [], screenshots: [] };
  let error;
  try {
    await step(receipt, "F1", "A real run whose Test failed", async () => {
      await instantiateReviewer(isolation, window, summary, false);
      await startNativeTemplate(isolation, window, summary);
      await driveUntil(isolation, window, summary, (value) =>
        ["Failed", "WaitingForApproval", "NeedsHuman"].includes(value.status),
      );
      await eachTheme(
        window,
        "run-failed",
        async () => {
          await openRuns(window);
          await window.locator('[data-testid="graph-run"]').first().click();
          await T(window, "graph-run-summary").waitFor();
        },
        isolation,
        receipt,
      );
    });
  } catch (caught) {
    error = caught;
  } finally {
    await finishReceipt(receipt, isolation, window, error);
  }
}

await mainJourney();
await failureJourney();
