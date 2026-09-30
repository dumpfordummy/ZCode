// 在 Electron（与产品同一 Chromium）里驱动原型，截取 1280x720 / 1920x1080，并记录交互断言。
// 原型全部是合成数据；这里的断言只说明原型自身的交互可用，不是原生执行或验收证据。
import { _electron as electron } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../..");
const audit = path.resolve(here, "..");
const outDir = path.join(audit, "screenshots", "prototype");
await mkdir(outDir, { recursive: true });
const html = path.join(audit, "prototype", "index.html");
const mainFile = path.join(here, "proto-main.cjs");
await writeFile(
  mainFile,
  `const { app, BrowserWindow } = require("electron");
app.whenReady().then(() => {
  const w = new BrowserWindow({ width: 1280, height: 720, useContentSize: true, show: true, webPreferences: { contextIsolation: true } });
  w.loadFile(process.env.PROTO_FILE);
});
app.on("window-all-closed", () => app.quit());
`,
);
const app = await electron.launch({
  executablePath: path.join(root, "node_modules/electron/dist/electron.exe"),
  args: [mainFile],
  env: { ...process.env, PROTO_FILE: html },
});
const page = await app.firstWindow();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.waitForLoadState("domcontentloaded");
const checks = [];
const check = (name, ok, detail) =>
  checks.push({ name, ok: Boolean(ok), ...(detail !== undefined ? { detail } : {}) });

async function size([w, h]) {
  const win = await app.browserWindow(page);
  try {
    await win.evaluate(
      (b, [ww, hh]) => {
        if (b.isMaximized()) b.unmaximize();
        b.setContentSize(ww, hh);
      },
      [w, h],
    );
  } finally {
    await win.dispose();
  }
  await page.waitForFunction(([ww, hh]) => innerWidth === ww && innerHeight === hh, [w, h]);
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
}
async function shot(
  name,
  sizes = [
    [1280, 720],
    [1920, 1080],
  ],
) {
  for (const s of sizes) {
    await size(s);
    const win = await app.browserWindow(page);
    try {
      const png = await win.evaluate(async (b) =>
        (await b.capturePage()).toPNG().toString("base64"),
      );
      await writeFile(path.join(outDir, `${name}-${s.join("x")}.png`), Buffer.from(png, "base64"));
    } finally {
      await win.dispose();
    }
  }
}
const P = () => page.evaluate(() => window.__proto.S.pane + "/" + window.__proto.S.selected);
await size([1280, 720]);

// 1 Compose (returning user: an approval from earlier is waiting)
await shot("p01-compose-returning");
check(
  "needs-you strip lists the pending approval on arrival",
  await page.locator("#needs.on").count(),
);
check(
  "Review is disabled while the request is empty",
  await page.locator("#go-review").isDisabled(),
);
await page.locator("#req").fill("Modify zz-demo.txt file content to after");
check("Review enables once a request is typed", !(await page.locator("#go-review").isDisabled()));
// context picker
await page.getByRole("button", { name: /Add file or skill/ }).click();
await page.locator("#pq").fill("skill");
await shot("p02-compose-context-picker", [[1280, 720]]);
await page.getByRole("button", { name: /fixture-guidance/ }).click();
check(
  "Context chip added separately from request",
  (await page.locator(".chips .chip", { hasText: "fixture-guidance" }).count()) === 1,
);
check(
  "Request text unchanged by context selection",
  (await page.locator("#req").inputValue()) === "Modify zz-demo.txt file content to after",
);
check(
  "Saved checks are labelled not run",
  (await page.locator(".pill", { hasText: "Saved · not run" }).count()) === 2,
);
await shot("p03-compose-filled");

// 2 Review (keyboard: Ctrl+Enter)
await page.locator("#req").focus();
await page.keyboard.press("Control+Enter");
await page.locator("#ack").waitFor();
check("Ctrl+Enter from the request opens Review", (await P()).startsWith("review"));
check("Start is disabled until acknowledgment", await page.locator("#go-start").isDisabled());
check(
  "All 8 unknown statements remain listed on Review",
  (await page.locator("#unknowns li").count()) === 8,
);
check("Nothing is pre-acknowledged", !(await page.locator("#ack").isChecked()));
await size([1280, 720]);
const geom = await page.evaluate(() => {
  const r = (s) => document.querySelector(s).getBoundingClientRect();
  return { ack: r("#ack"), start: r("#go-start"), vh: innerHeight };
});
check(
  "At 1280x720 the acknowledgment and Start are visible without scrolling",
  geom.ack.bottom <= geom.vh && geom.start.bottom <= geom.vh,
  {
    ackBottom: Math.round(geom.ack.bottom),
    startBottom: Math.round(geom.start.bottom),
    vh: geom.vh,
  },
);
await shot("p04-review");
await page.locator("#detail").evaluate((e) => (e.scrollTop = e.scrollHeight));
await shot("p05-review-scrolled", [[1280, 720]]);
await page.locator("#ack").check();
check("Acknowledgment enables Start", !(await page.locator("#go-start").isDisabled()));

// 3 Run: choose the reviewer-output-rejected scenario, go through permissions
await page.evaluate(() => {
  window.__proto.S.scenario = "reviewer";
  window.__proto.S.speed = 0.25;
});
await page.locator("#go-start").click();
await page.waitForFunction(() => window.__proto.S.runs[0].status === "running");
await shot("p06-running", [[1280, 720]]);
await page.waitForFunction(() => window.__proto.S.runs[0].status === "needs-permission");
await page.waitForTimeout(300);
await shot("p07-permission-wait");
check(
  "Permission alert shows tool and target before leaving Graph",
  (await page.locator(".alert.warn .kv").innerText()).includes("zz-demo.txt"),
);
check(
  "Needs-you strip appears with a direct conversation action",
  await page.getByRole("button", { name: "Review in conversation" }).first().isVisible(),
);
await page.getByRole("button", { name: "Review in conversation" }).last().click();
await page.locator(".conv").waitFor();
await shot("p08-conversation-permission");
check(
  "Conversation has a persistent way back to the run",
  await page.getByRole("button", { name: "Back to run" }).first().isVisible(),
);
await page.locator("#conv-confirm").click();
await page.locator("#conv-return").waitFor();
check(
  "After Allow, focus moves to Back to run",
  await page.evaluate(() => document.activeElement.id === "conv-return"),
);
await page.locator("#conv-return").click();
async function allowNext() {
  await page.waitForFunction(() => window.__proto.S.runs[0].status !== "running");
  if ((await page.evaluate(() => window.__proto.S.runs[0].status)) !== "needs-permission")
    return false;
  await page.getByRole("button", { name: "Review in conversation" }).last().click();
  await page.locator("#conv-confirm").click();
  await page.locator("#conv-return").click();
  return true;
}
check("Second permission (Build) surfaces", await allowNext());
check("Third permission (Test) surfaces", await allowNext());
await page.waitForFunction(() => window.__proto.S.runs[0].status === "stopped-review", null, {
  timeout: 30000,
});
await page.waitForTimeout(200);
await shot("p09-failure-reviewer-output");
check(
  "Failure names the cause and says no approval was requested",
  (await page.locator(".alert.bad").innerText()).includes("no approval was requested"),
);
check(
  "Decision verdict reads Not requested (not Pending)",
  (await page.locator(".verdict", { hasText: "Your decision" }).innerText()).includes(
    "Not requested",
  ),
);
await page.getByRole("button", { name: "Inspect reviewer output" }).click();
check(
  "Inspect reviewer output opens the raw output tab",
  (await page.locator("#panel .rawout").innerText()).includes("Review follows."),
);
await shot("p10-failure-evidence", [[1280, 720]]);

// 4 New request from a finished run
await page.getByRole("button", { name: "Start a new request from this one" }).click();
check(
  "New request prefills without starting anything",
  (await page.locator("#req").inputValue()).startsWith("Modify zz-demo.txt") &&
    (await P()).startsWith("compose"),
);
await shot("p11-new-request-prefilled", [[1280, 720]]);

// 5 Other states via labelled jump
await page.evaluate(() => window.__proto.jump("approval"));
await shot("p12-approval-gate");
check(
  "Approve is disabled until a comment is entered",
  await page.locator("#btn-approve").isDisabled(),
);
await page.locator("#cmt").fill("Looks right.");
check("Comment enables Approve/Reject", !(await page.locator("#btn-approve").isDisabled()));
await page.evaluate(() => window.__proto.jump("fail-test"));
await shot("p13-failure-test");
// tabs keyboard model
await page.locator("#tab-checks").focus();
await page.keyboard.press("ArrowRight");
check(
  "Tabs use arrow keys (roving tabindex)",
  await page.evaluate(
    () =>
      document.activeElement.id === "tab-changes" &&
      document.activeElement.getAttribute("aria-selected") === "true",
  ),
);
// checks screen
await page
  .getByRole("button", { name: "Checks", exact: false })
  .first()
  .evaluate((e) => e.click());
await page.locator('[data-act="nav"][data-v="checks"]').last().click();
await page.locator("#f-name").fill("Test demo content (edited)");
check(
  "Editing one check leaves the other unchanged",
  await page.evaluate(
    () =>
      window.__proto.S.checksSaved[0].name === "Build demo" &&
      window.__proto.S.checks[1].name.includes("edited"),
  ),
);
await page.getByRole("button", { name: "Save check" }).click();
check(
  "Save persists only after explicit action",
  await page.evaluate(() => window.__proto.S.checksSaved[1].name.includes("edited")),
);
await shot("p14-checks");

// 5b Regression checks for four defects found by an independent exercise of the first prototype.
// (1) Agent-assisted approval must not claim checks that do not exist.
await page.evaluate(() => window.__proto.jump("approval", { wf: "agent" }));
const agentAlert = await page.locator(".alert.warn").first().innerText();
check(
  "Agent-assisted approval does not say Build and Test passed",
  !/Build and Test passed/.test(agentAlert) && /No project checks/.test(agentAlert),
  agentAlert.slice(0, 120),
);
check(
  "Agent-assisted Checks verdict is not a pass",
  !(await page.locator(".verdict", { hasText: "Checks" }).innerText()).includes("passed"),
);
// (2) Unsaved edits survive selecting another check, and runs read saved settings only.
await page.locator('[data-act="nav"][data-v="checks"]').last().click();
await page.locator('[data-act="check-sel"][data-id="test"]').click();
await page.locator("#f-name").fill("Edited test");
await page.locator('[data-act="check-sel"][data-id="build"]').click();
check(
  "Build check has nothing to save",
  await page.locator('[data-act="check-save"]').isDisabled(),
);
await page.locator('[data-act="check-sel"][data-id="test"]').click();
check(
  "Unsaved edit is still present after selecting another check",
  (await page.locator("#f-name").inputValue()) === "Edited test",
);
check(
  "Unsaved row is marked and nothing was saved",
  (await page.locator('[data-act="check-sel"][data-id="test"]').innerText()).includes("Unsaved") &&
    (await page.evaluate(() => window.__proto.S.checksSaved[1].name)) !== "Edited test",
);
await page.locator('[data-act="check-revert"]').click();
check(
  "Revert restores only the selected check",
  (await page.locator("#f-name").inputValue()) !== "Edited test",
);
// (3)+(4) Permission mock: option 3 is unavailable (never Allow) and arrow keys move the choice.
await page.evaluate(() => window.__proto.jump("perm"));
await page.getByRole("button", { name: "Review in conversation" }).last().click();
check(
  "Third permission option is disabled and labelled",
  (await page.locator('[role="radio"][disabled]').count()) === 1 &&
    (await page.locator('[role="radio"][disabled]').innerText()).includes("not available"),
);
await page.locator('[role="radio"][aria-checked="true"]').focus();
await page.keyboard.press("ArrowDown");
check(
  "ArrowDown moves Allow to Deny",
  await page.evaluate(() => window.__proto.S.convChoice === 1),
);
await page.keyboard.press("ArrowDown");
check(
  "Arrow navigation wraps within the two available options",
  await page.evaluate(() => window.__proto.S.convChoice === 0),
);
await page.keyboard.press("ArrowUp");
check("ArrowUp moves back to Deny", await page.evaluate(() => window.__proto.S.convChoice === 1));
await page
  .locator('[role="radio"][disabled]')
  .click({ force: true })
  .catch(() => {});
check(
  "Clicking the unavailable option changes nothing",
  await page.evaluate(() => window.__proto.S.convChoice === 1 && !window.__proto.S.convDone),
);
await page.locator('[role="radio"][aria-checked="true"]').focus();
await page.keyboard.press("Enter");
check(
  "Enter on Deny denies (not allows)",
  await page.evaluate(
    () => window.__proto.S.convDone === "deny" && window.__proto.S.runs[0].status === "cancelled",
  ),
);
await page.locator("#conv-return").click();

// 6 Locale / theme / narrow
await page.evaluate(() => {
  const S = window.__proto.S;
  S.lang = "zh";
  window.__proto.act("new");
});
await page.locator("#req").fill("把 zz-demo.txt 的内容改为 after");
await shot("p15-compose-zh", [[1280, 720]]);
await page.locator("#req").focus();
await page.keyboard.press("Control+Enter");
await shot("p16-review-zh", [[1280, 720]]);
await page.evaluate(() => {
  const S = window.__proto.S;
  S.lang = "en";
  S.theme = "light";
  document.documentElement.dataset.theme = "light";
  window.__proto.act("new");
});
await page.locator("#req").fill("Modify zz-demo.txt file content to after");
await shot("p17-compose-light", [[1280, 720]]);
await page.evaluate(() => window.__proto.jump("fail-reviewer"));
await shot("p18-failure-light", [[1280, 720]]);
await page.evaluate(() => {
  window.__proto.S.theme = "dark";
  document.documentElement.dataset.theme = "dark";
});
await size([390, 800]);
await page.evaluate(() => window.__proto.act("new"));
await shot("p19-narrow-compose", [[390, 800]]);
check(
  "No horizontal page scroll at 390px",
  await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
);
await size([1280, 720]);

// focus-indicator sample (border/background based because the product resets outline globally)
await page.evaluate(() => {
  window.__proto.S.lang = "en";
  window.__proto.act("new");
});
await page.keyboard.press("Tab");
const focus = await page.evaluate(() => {
  const b = [...document.querySelectorAll(".nav-btn")].find(
    (x) => x.getAttribute("aria-current") !== "page",
  );
  b.blur();
  const s0 = getComputedStyle(b);
  const before = { border: s0.borderBottomColor, bg: s0.backgroundColor };
  b.focus();
  const s1 = getComputedStyle(b);
  return {
    focusVisible: b.matches(":focus-visible"),
    before,
    after: { border: s1.borderBottomColor, bg: s1.backgroundColor },
    outline: s1.outlineStyle,
    shadow: s1.boxShadow,
  };
});
check(
  "Keyboard focus changes border and fill (outline and box-shadow stay off, as the product resets them)",
  focus.focusVisible &&
    focus.before.border !== focus.after.border &&
    focus.before.bg !== focus.after.bg &&
    focus.outline === "none" &&
    focus.shadow === "none",
  focus,
);
check("No console or page errors", errors.length === 0, errors.slice(0, 5));
await writeFile(
  path.join(audit, "tools", "prototype-check.json"),
  JSON.stringify({ checks, errors }, null, 2),
);
await app.close();
console.log(
  checks
    .map(
      (c) => `${c.ok ? "PASS" : "FAIL"} ${c.name}${c.detail ? " " + JSON.stringify(c.detail) : ""}`,
    )
    .join("\n"),
);
