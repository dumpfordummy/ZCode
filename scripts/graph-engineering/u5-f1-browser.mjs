import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { runUxBrowserSuite } from "./ux-browser-runner.mjs";
import { boot, chooseGeneric, T, until } from "./ux-m1-helpers.mjs";
import { inspectionArguments } from "../../packages/shared/src/project-inspection.ts";

await runUxBrowserSuite({
  suite: "U5-F1 real component / controlled inspection observations (not native acceptance)",
  scenarios: ["en-US", "zh-CN"].map((locale) => ({
    name: "explicit review and denied observation never enable Web Save: " + locale,
    async run({ page, host, url, shotsDir }) {
      await mkdir(path.join(host.workspaces.A, "Api"), { recursive: true });
      await writeFile(
        path.join(host.workspaces.A, "Api/Api.csproj"),
        '<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>',
      );
      await boot(page, host, url, { locale, theme: "zai-light" });
      await chooseGeneric(page);
      await T(page, "graph-template-setup-checks").click();
      await T(page, "graph-quick-scan").click();
      await until(
        async () => await T(page, "graph-project-inspection").count(),
        "unsupported inspection panel",
      );
      const panel = T(page, "graph-project-inspection");
      const original = host.bridge.projectSetup;
      const calls = [];
      let row;
      let denyNext = true;
      host.bridge.projectSetup = async (input) => {
        if (input.action === "inspection-history")
          return { kind: "inspection-history", records: row ? [structuredClone(row)] : [] };
        if (input.action !== "inspection") return original(input);
        calls.push(input.command.action);
        if (input.command.action === "review") {
          const binding = {
            ...input.command.selection,
            purpose: "project-configuration-inspection-v1",
            sdkDirectory: "C:/Synthetic/dotnet/sdk/8.0.426",
            observationDigest: "a".repeat(64),
            observedFiles: 3508,
            observedBytes: 405626873,
            expiresAt: Date.now() + 300000,
          };
          const id = randomUUID();
          row = {
            version: 1,
            kind: "project-inspection",
            id,
            sessionId: "synthetic-inspection-session",
            target: { workspacePath: "C:/Synthetic/Web" },
            selection: input.command.selection,
            status: "review-ready",
            reserved: false,
            scopeComplete: false,
            timings: [],
            message: "Controlled UI fixture",
            requestDigest: "b".repeat(64),
            request: {
              operationId: id,
              inspection: binding,
              recipe: {
                id: binding.purpose,
                executable: "C:/Synthetic/dotnet/dotnet.exe",
                args: inspectionArguments(binding),
                cwdRelative: ".",
                timeoutMs: 30000,
              },
            },
          };
        } else if (input.command.action === "start") {
          row = {
            ...row,
            status: denyNext ? "denied" : "awaiting-permission",
            reserved: !denyNext,
          };
          denyNext = false;
        } else if (input.command.action === "cancel")
          row = { ...row, status: "cancelled", reserved: false };
        return structuredClone(row);
      };
      const shot = async (name) => {
        if (shotsDir) {
          await panel.scrollIntoViewIfNeeded();
          await page.screenshot({
            path: path.join(shotsDir, name + "-" + locale + ".png"),
            fullPage: true,
          });
        }
      };
      assert.deepEqual(calls, []);
      assert.equal(await T(page, "graph-quick-save").isEnabled(), false);
      await shot("unsupported-web-en");
      await panel.getByRole("combobox").nth(0).click();
      await page.getByRole("option", { name: "8.0.426", exact: true }).click();
      await panel.getByRole("combobox").nth(1).click();
      await page.getByRole("option", { name: "net8.0", exact: true }).click();
      assert.deepEqual(calls, []);
      await panel
        .getByRole("button", {
          name: locale === "en-US" ? "Inspect with installed MSBuild" : "使用已安装 MSBuild 检查",
          exact: true,
        })
        .click();
      await until(
        async () => (await panel.getAttribute("data-status")) === "review-ready",
        "review ready",
      );
      assert.deepEqual(calls, ["review"]);
      await shot("explicit-command-review-en");
      await panel
        .getByRole("button", {
          name:
            locale === "en-US"
              ? "Confirm inspection and request native permission"
              : "确认检查并请求原生权限",
          exact: true,
        })
        .click();
      await until(async () => (await panel.getAttribute("data-status")) === "denied", "denied");
      assert.equal(await T(page, "graph-quick-save").isEnabled(), false);
      await shot("controlled-denied-en");
      assert.equal(calls.filter((c) => c === "start").length, 1);
      // Separate reviewed operation, now pending ordinary permission. The controlled callback
      // records navigation; locale remount exercises the same unmount/reopen component boundary.
      await panel
        .getByRole("button")
        .filter({
          hasText:
            locale === "en-US" ? /^Inspect with installed MSBuild$/ : /^使用已安装 MSBuild 检查$/,
        })
        .click();
      await until(
        async () => (await panel.getAttribute("data-status")) === "review-ready",
        "second review",
      );
      await panel
        .getByRole("button")
        .filter({
          hasText:
            locale === "en-US"
              ? /^Confirm inspection and request native permission$/
              : /^确认检查并请求原生权限$/,
        })
        .click();
      await until(
        async () => (await panel.getAttribute("data-status")) === "awaiting-permission",
        "owned permission wait",
      );
      const cancelledBefore = calls.filter((c) => c === "cancel").length;
      await T(page, "graph-inspection-conversation").click();
      await page.evaluate(
        (next) => window.__harness.set({ locale: next }),
        locale === "en-US" ? "zh-CN" : "en-US",
      );
      await until(
        async () => await T(page, "graph-inspection-recovery").count(),
        "recovery after navigation remount",
      );
      const recovery = T(page, "graph-inspection-recovery");
      await recovery.locator("summary").click();
      await until(
        async () => await recovery.locator(`[data-operation-id="${row.id}"]`).count(),
        "retained operation",
      );
      assert.equal(calls.filter((c) => c === "start").length, 2);
      assert.equal(
        calls.filter((c) => c === "cancel").length,
        cancelledBefore,
        "conversation navigation must not cancel owned permission",
      );
      const retained = recovery.locator(`[data-operation-id="${row.id}"]`);
      await retained.getByRole("button").nth(0).click();
      assert.equal(calls.filter((c) => c === "start").length, 2, "status cannot replay");
      await retained.getByRole("button").nth(1).click();
      await until(
        async () => (await retained.getAttribute("data-status")) === "cancelled",
        "explicit original-operation cancellation",
      );
      if (shotsDir)
        await page.screenshot({
          path: path.join(shotsDir, `recovery-navigation-${locale}.png`),
          fullPage: true,
        });
    },
  })),
});
