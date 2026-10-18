// Z8.5-UX-P2-F1 evidence for the documentation correction (finding 6): the visible text of the
// Checks setup page with "Advanced" expanded, recorded as JSON on whichever tree runs it. Run it on
// the UX-P1 head, the frozen UX-P2 head and F1 with `--shots=<dir>` and diff the three files.
// Synthetic records; asserts nothing about equality (it only records).
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runUxBrowserSuite } from "./ux-browser-runner.mjs";
import { T, flush, setState, preparedDraft } from "./ux-m1-helpers.mjs";

const scenario = (variant) => ({
  name: `UX-P2-F1 evidence: Checks setup page with Advanced expanded (${variant.locale})`,
  async run({ page, host, url, shotsDir }) {
    await page.setViewportSize({ width: 1366, height: 768 });
    await preparedDraft(page, host, url);
    await setState(page, { locale: variant.locale, theme: "zai-light" });
    await T(page, "graph-new-run-pane").waitFor();
    await T(page, "graph-template-setup-checks").click();
    await T(page, "graph-checks-advanced").waitFor();
    await T(page, "graph-checks-advanced").evaluate((node) => {
      node.open = true;
    });
    await flush(page);
    const read = (id) =>
      T(page, id).evaluate((node) => node.innerText.replace(/\s+/g, " ").trim());
    const record = {
      locale: variant.locale,
      status: await read("graph-recipe-read-state"),
      advanced: await read("graph-checks-advanced"),
      page: await read("graph-project-recipes"),
    };
    await mkdir(shotsDir, { recursive: true });
    await writeFile(
      path.join(shotsDir, `checks-page-${variant.locale}.json`),
      `${JSON.stringify(record, null, 2)}\n`,
    );
  },
});

export const scenarios = [{ locale: "en-US" }, { locale: "zh-CN" }].map(scenario);

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename))
  await runUxBrowserSuite({
    suite: "Z8.5-UX-P2-F1 Checks page text evidence (records only)",
    scenarios,
  });
