// Z8.5-UX-P2 shared behaviour helpers: viewports, text, the passive-viewing assertion, the
// accessible-name scan and run opening. Synthetic records; not native acceptance.
import assert from "node:assert/strict";
import { T, boot, flush, admissionCalls } from "./ux-m1-helpers.mjs";
import { assertCleanP2, fixtures } from "./ux-p2-states.mjs";

export const EN = { tag: "1366", width: 1366, height: 768, locale: "en-US", theme: "zai-dark" };
export const ZH = { tag: "1093-zh", width: 1093, height: 614, locale: "zh-CN", theme: "zai-light" };
export const WIDE = { tag: "1600", width: 1600, height: 900, locale: "en-US", theme: "zai-light" };
export const text = async (locator) => (await locator.innerText()).replace(/\s+/g, " ").trim();

/** Calls that must never come from looking, expanding or switching tabs. */
export const FORBIDDEN_WHEN_VIEWING = [
  "openConversation",
  "wf.instantiate",
  "wf.prepare",
  "graph.saveDefinition",
  "graph.recipes.save",
  "graph.run",
  "selectFile",
  "saveFile",
];
export const assertPassive = (host, what) => {
  assert.deepEqual(
    host.calls.filter((call) => FORBIDDEN_WHEN_VIEWING.includes(call.op) && call.phase === "start"),
    [],
    `${what}: viewing caused a Host call`,
  );
  assert.equal(admissionCalls(host).length, 0, `${what}: nothing admitted`);
  assertCleanP2(host);
};

/** Visible interactive controls without any accessible name (aria-label, labelledby, text, label, title). */
export const unnamedControls = (page, scope = "[data-view]") =>
  page
    .locator(scope)
    .first()
    .evaluate((root) => {
      const selector =
        'button, [role="button"], [role="combobox"], [role="tab"], a[href], summary, input:not([type="hidden"]), textarea, select';
      const inClosedDisclosure = (element) => {
        for (
          let details = element.closest("details:not([open])");
          details;
          details = details.parentElement?.closest("details:not([open])")
        )
          if (!(element.tagName === "SUMMARY" && element.parentElement === details)) return true;
        return false;
      };
      const visible = (element) => {
        if (inClosedDisclosure(element)) return false;
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          box.width > 0 &&
          box.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none"
        );
      };
      const label = (element) =>
        element.getAttribute("aria-label") ||
        (element.getAttribute("aria-labelledby") ?? "")
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? "")
          .join(" ") ||
        element.innerText ||
        element.value ||
        element.getAttribute("title") ||
        [...(element.labels ?? [])].map((item) => item.innerText).join(" ") ||
        "";
      return [...root.querySelectorAll(selector)]
        .filter(visible)
        .filter((element) => !label(element).trim())
        .map((element) => {
          const shell = element.cloneNode(false);
          shell.removeAttribute("class");
          return `${shell.outerHTML.slice(0, 200)} :: ${element.closest("[data-testid]")?.getAttribute("data-testid") ?? "?"}`;
        });
    });

export async function openRun(page, host, url, name, variant = EN) {
  const run = fixtures[name]();
  host.setRuns("A", [run]);
  await boot(page, host, url, { locale: variant.locale, theme: variant.theme });
  await page.setViewportSize({ width: variant.width, height: variant.height });
  await page.locator(`[data-testid="graph-run"][data-run-id="${run.id}"]`).click();
  await T(page, "graph-run-summary").waitFor();
  await flush(page);
  return run;
}
