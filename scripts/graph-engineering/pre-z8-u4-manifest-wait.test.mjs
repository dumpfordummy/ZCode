// Focused regression for the manifest-ready wait fix in pre-z8-u4-artifact-ui.mjs.
//
// The ReadState component renders an intentionally empty (zero-height) <div> when the read
// completes (data-state="ready"); only loading/error render children. The harness fix changed
// waitFor() (visibility) to waitFor({ state: "attached" }) while keeping the
// [data-state="ready"] attribute selector, which itself excludes loading/error.
//
// These tests drive the actual Playwright locator semantics against a loopback page whose
// data-state transitions under a test-released completion signal (no timers) — not fixed sleeps.
// They verify the wait behavior, not source strings.

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

// Mirror the fixed locator from pre-z8-u4-artifact-ui.mjs:50-52.
const READY_LOCATOR = '[data-testid="graph-manifest-read-state"][data-state="ready"]';

/**
 * Render the inspector read-state div exactly as ReadState does: the outer div is always
 * present with data-state={status}; ready renders no children (zero-size). The `schedule`
 * callback runs inside the page to transition data-state under the test's control.
 */
function pageHtml(initialStatus, transition) {
  // The transition script flips data-state from the initial status to "ready" (or "error")
  // after the page signals it. The signal is a global function the test calls.
  return `<!doctype html>
<meta charset="utf-8" />
<title>manifest-wait-fixture</title>
<body>
  <div role="status" data-testid="graph-manifest-read-state" data-state="${initialStatus}" class="text-ui-sm"></div>
  <script>
    window.__transition = ${transition};
    window.__complete = function (to) { window.__transition(to); };
  </script>
</body>`;
}

async function withPage(initialStatus, transitionScript, fn) {
  const profile = await mkdtemp(path.join(tmpdir(), "z1-manifest-wait-"));
  const context = await chromium.launchPersistentContext(profile, {
    channel: "msedge",
    headless: true,
    chromiumSandbox: true,
    viewport: { width: 1280, height: 720 },
    locale: "en-US",
  });
  let result;
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.setContent(pageHtml(initialStatus, transitionScript));
    result = await fn(page);
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
  return result;
}

test("ready element is not visible; visible wait fails, attached wait passes", async () => {
  // ReadState renders an empty (no-children) <div data-state="ready">. With no content the div
  // has zero height, so Playwright considers it not visible — the exact condition that broke the
  // old waitFor() (default visible) at pre-z8-u4-artifact-ui.mjs:50. This fixture renders the
  // same empty outer div. We prove non-visibility with the browser's actual layout size and
  // Playwright's visibility API (not a child-count proxy), prove the original visible wait
  // cannot complete, and prove the fixed attached wait (keeping [data-state="ready"]) does.
  await withPage(
    "idle",
    `function (to) { document.querySelector('[data-testid="graph-manifest-read-state"]').setAttribute('data-state', to || 'ready'); }`,
    async (page) => {
      await page.evaluate(() => window.__complete("ready"));
      const ready = page.locator(READY_LOCATOR);
      // 1. Actual size: the empty ready div has zero height (nothing renders inside it), which is
      //    why a visibility wait can never succeed. Read the browser's own layout rect — width is
      //    irrelevant, only the zero height matters.
      const rect = await ready.evaluate((el) => el.getBoundingClientRect());
      assert.equal(rect.height, 0);
      // 2. Playwright's visibility API confirms the element is not visible.
      assert.equal(await ready.isVisible(), false);
      // 3. The original visible wait cannot complete on this element — exactly what broke the
      //    harness before the fix. The bounded timeout is a failure upper bound, not a sleep.
      await assert.rejects(ready.waitFor({ state: "visible", timeout: 1000 }), /Timeout/);
      // 4. The fixed attached wait (keeping [data-state="ready"]) completes.
      await ready.waitFor({ state: "attached" });
      assert.equal(await ready.getAttribute("data-state"), "ready");
    },
  );
});

test("loading then test-released ready transition is awaited, not pre-empted", async () => {
  // The element starts at loading. The state moves to ready ONLY when the test releases the
  // completion signal — there is no timer. The wait must not complete before the release and
  // must complete after it. The bounded timeout is a failure upper bound, not the sync method.
  const transitionScript = `function (to) {
    document.querySelector('[data-testid="graph-manifest-read-state"]').setAttribute('data-state', to || 'ready');
  }`;
  await withPage("loading", transitionScript, async (page) => {
    // Before release: [data-state="ready"] does not match (state is loading), so the attached
    // wait cannot complete. A bounded-time wait proves this by timing out — the timeout is a
    // failure upper bound proving non-completion, not a sleep that the test relies on to pass.
    await assert.rejects(
      page.locator(READY_LOCATOR).waitFor({ state: "attached", timeout: 500 }),
      /Timeout/,
    );
    assert.equal(
      await page.locator('[data-testid="graph-manifest-read-state"]').getAttribute("data-state"),
      "loading",
    );
    // Release the completion signal — test-controlled, no timer.
    await page.evaluate(() => window.__complete("ready"));
    // Now the wait completes promptly.
    await page.locator(READY_LOCATOR).waitFor({ state: "attached", timeout: 3000 });
    assert.equal(await page.locator(READY_LOCATOR).getAttribute("data-state"), "ready");
  });
});

test("stuck loading is never treated as ready", async () => {
  // The element stays loading (no completion signal). The [data-state="ready"] selector must
  // not match; the attached wait must time out, not pass.
  await withPage("loading", `function (to) { /* never transitions */ }`, async (page) => {
    // Do not call __complete. The element remains data-state="loading".
    await assert.rejects(
      page.locator(READY_LOCATOR).waitFor({ state: "attached", timeout: 1500 }),
      /Timeout/,
    );
    assert.equal(
      await page.locator('[data-testid="graph-manifest-read-state"]').getAttribute("data-state"),
      "loading",
    );
  });
});

test("error state is never treated as ready", async () => {
  // The element transitions to error (read failed). The [data-state="ready"] selector must
  // not match error; the attached wait must time out, confirming error is not confused with
  // ready.
  await withPage(
    "loading",
    `function (to) { document.querySelector('[data-testid="graph-manifest-read-state"]').setAttribute('data-state', to || 'error'); }`,
    async (page) => {
      await page.evaluate(() => window.__complete("error"));
      await assert.rejects(
        page.locator(READY_LOCATOR).waitFor({ state: "attached", timeout: 1500 }),
        /Timeout/,
      );
      assert.equal(
        await page.locator('[data-testid="graph-manifest-read-state"]').getAttribute("data-state"),
        "error",
      );
    },
  );
});
