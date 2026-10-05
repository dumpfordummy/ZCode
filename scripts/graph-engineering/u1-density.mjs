// Real operator-view components; paired synthetic records, never native execution evidence.
import assert from "node:assert/strict";
import { T, flush, setState, admissionCalls, assertClean } from "./ux-m1-helpers.mjs";
import { u1DensityRuns, u1Run } from "./u1-runs.mjs";
import {
  questionWaitRun,
  invalidEvidenceRun,
  malformedReviewerRun,
  validReviewerRun,
  approvalWaitRun,
  completedRun,
} from "./ux-m1-runs.mjs";

const pick = async (page, run) => {
  await page.locator(`[data-testid="graph-run"][data-run-id="${run.id}"]`).click();
  await T(page, "graph-run-summary").waitFor();
};

export function densityScenario({ boot, capture, before = false }) {
  return {
    name: "U1 operator information density, actionable states and on-demand diagnostics",
    async run({ page, host, url, shotsDir }) {
      const runs = u1DensityRuns();
      host.setRuns("A", runs);
      const original = JSON.stringify(host.graph.A.runs);
      await boot(page, host, url);
      for (const locale of ["en-US", "zh-CN"]) {
        await setState(page, { locale, theme: locale === "en-US" ? "zai-dark" : "zai-light" });
        for (const size of [
          { width: 1600, height: 1080 },
          { width: 1093, height: 768 },
        ]) {
          await page.setViewportSize(size);
          for (const run of runs) {
            await pick(page, run);
            await T(page, "graph-select-node-task").click();
            await page.locator("[data-view]").evaluate((node) => {
              node.scrollTop = 0;
            });
            await flush(page);
            if (locale === "en-US" && size.width === 1600) {
              await capture(page, shotsDir, `density-${run.id}`);
              if (run.status === "Running") {
                await page.locator("[data-view]").evaluate((node) => {
                  node.scrollTop = node.scrollHeight;
                });
                await capture(page, shotsDir, "density-running-step-footer");
                await page.locator("[data-view]").evaluate((node) => {
                  node.scrollTop = 0;
                });
              }
            }
            assert.equal(
              await T(page, "graph-run-execution").getAttribute("data-state"),
              run.status,
            );
            assert.equal(
              await T(page, "graph-run-graph-toggle").getAttribute("aria-pressed"),
              "false",
            );
            if (run.status === "WaitingForPermission") {
              assert.equal(await T(page, "graph-run-permission").isVisible(), true);
              assert.equal(await T(page, "graph-run-open-native").isVisible(), true);
            }
            if (run.status === "WaitingForApproval") {
              assert.equal(await T(page, "graph-run-human").getAttribute("data-state"), "pending");
              assert.equal(await T(page, "graph-run-review-gate").isVisible(), true);
            }
            if (run.status === "NeedsHuman") {
              assert.equal(
                await T(page, "graph-run-evidence").getAttribute("data-state"),
                "tests-failed",
              );
              assert.equal(await T(page, "graph-run-inspect-failure").isVisible(), true);
            }
            if (run.status === "AwaitingContinuation") {
              const resume = T(page, "graph-route-continue");
              assert.equal(await resume.isVisible(), true);
              assert.equal(await resume.isEnabled(), true);
              assert.equal(await resume.getAttribute("data-checkpoint-id"), "repair-resume");
              assert.equal(await resume.getAttribute("data-checkpoint-digest"), "c".repeat(64));
            }
            if (before) continue;
            assert.equal(await T(page, "graph-routing-iterations").count(), 0);
            assert.equal(await T(page, "graph-routing-checkpoints").count(), 0);
            assert.equal(await T(page, "graph-export-manifest").count(), 0);
            assert.equal(
              await T(page, "graph-artifact-inspector").count(),
              0,
              "empty selected step has no artifact section",
            );
            if (run.status === "AwaitingContinuation") {
              assert.equal(await T(page, "graph-routing-progress").isVisible(), true);
              assert.match(
                await T(page, "graph-routing-progress").innerText(),
                /parser still drops empty input/,
              );
              assert.match(
                await T(page, "graph-routing-progress").locator("p").first().innerText(),
                locale === "en-US" ? /2 iterations recorded/ : /已记录 2 轮迭代/,
              );
            } else {
              assert.equal(
                await T(page, "graph-region-inspector").count(),
                0,
                "ordinary routing is absent from Steps",
              );
            }
            // Technical details retains the exact diagnostics and read-only manifest action.
            await T(page, "graph-run-tab-technical").click();
            const iterations = T(page, "graph-routing-iterations");
            assert.equal(await iterations.isVisible(), true);
            assert.equal(await iterations.evaluate((node) => node.open), false);
            await iterations.locator(":scope > summary").focus();
            await page.keyboard.press("Enter");
            assert.ok(
              (await iterations.locator("dl").first().innerText()).includes(
                `${run.routing.admissions} / ${run.definition.routing.limits.maxNodeAdmissions}`,
              ),
            );
            const checkpoints = T(page, "graph-routing-checkpoints");
            assert.equal(await checkpoints.count(), run.routing.checkpoints.length ? 1 : 0);
            if (run.routing.checkpoints.length) {
              await checkpoints.locator(":scope > summary").click();
              assert.match(await checkpoints.innerText(), /repair-resume/);
            }
            assert.equal(await T(page, "graph-export-manifest").isVisible(), true);
            await T(page, "graph-export-manifest").click();
            await T(page, "graph-artifact-manifest").waitFor();
            const manifest = JSON.parse(await T(page, "graph-artifact-manifest").inputValue());
            assert.equal(manifest.runId, run.id);
            assert.deepEqual(manifest.artifacts, run.artifacts);
            await T(page, "graph-run-tab-steps").click();
            if (run.status === "NeedsHuman") {
              await T(page, "graph-run-inspect-failure").click();
              assert.equal(
                await T(page, "graph-tool-evidence").getAttribute("data-state"),
                "failed",
              );
              assert.equal(
                await T(page, "graph-artifact-inspector").getAttribute("data-count"),
                "1",
              );
              const artifacts = T(page, "graph-artifact-list");
              assert.match(
                await artifacts.locator(":scope > summary").innerText(),
                locale === "en-US" ? /1 captured artifact/ : /已捕获 1 个工件/,
              );
              assert.equal(await artifacts.evaluate((node) => node.open), false);
              await artifacts.locator(":scope > summary").focus();
              await page.keyboard.press("Space");
              const content = T(page, "graph-artifact-open-artifact-check");
              await content
                .locator("xpath=ancestor::details[1]")
                .locator(":scope > summary")
                .click();
              await content.click();
              await T(page, "graph-artifact-content").waitFor();
              assert.equal(
                await T(page, "graph-artifact-content").getAttribute("data-artifact-id"),
                "artifact-check",
              );
              assert.match(
                await T(page, "graph-artifact-content").innerText(),
                /Synthetic retained content/,
              );
              assert.equal(await T(page, "graph-export-manifest").count(), 0);
            }
            if (run.status === "WaitingForApproval") {
              await T(page, "graph-run-review-gate").click();
              assert.equal(await T(page, "graph-approval-request").isVisible(), true);
              assert.equal(await T(page, "graph-approval-approve").isVisible(), true);
              assert.equal(await T(page, "graph-approval-reject").isVisible(), true);
            }
          }
        }
      }
      assert.equal(
        JSON.stringify(host.graph.A.runs),
        original,
        "diagnostics and evidence inspection do not rewrite records",
      );
      assert.equal(admissionCalls(host).length, 0, "view/read/export never admits or saves work");
      if (!before) {
        const stopped = u1Run();
        stopped.id = "density-stopped";
        stopped.status = "NoProgress";
        stopped.routing.stopReason = {
          kind: "NoProgress",
          message: "Repair repeated the same failure.",
          at: 1,
        };
        const unknown = u1Run();
        unknown.id = "density-unknown";
        unknown.status = unknown.nodeAttempts[0].status = "Unknown";
        const stale = approvalWaitRun("density-stale");
        stale.status = stale.approvalAttempts[0].status = "StaleEvidence";
        const rejected = completedRun("density-rejected");
        rejected.status = rejected.approvalAttempts[0].status = "Rejected";
        rejected.approvalAttempts[0].decision.value = "reject";
        const fingerprint = u1Run();
        fingerprint.id = "density-fingerprint";
        fingerprint.routing.iterations[0].failureFingerprint = "raw-fingerprint-hidden";
        const missing = invalidEvidenceRun("density-missing");
        missing.artifacts = [];
        const consumed = u1Run();
        consumed.id = "density-consumed";
        consumed.routing.checkpoints = [{ ...runs.at(-1).routing.checkpoints[0], consumedAt: 1 }];
        const variants = [
          stopped,
          unknown,
          stale,
          rejected,
          fingerprint,
          missing,
          consumed,
          questionWaitRun(),
          invalidEvidenceRun(),
          malformedReviewerRun(),
          validReviewerRun("needs_changes"),
        ];
        host.setRuns("A", variants);
        for (const run of variants) {
          await pick(page, run);
          if (run === stopped) assert.equal(await T(page, "graph-routing-stop").isVisible(), true);
          if (run === unknown)
            assert.equal(
              await T(page, "graph-run-execution").getAttribute("data-state"),
              "Unknown",
            );
          if (run.status === "WaitingForUser")
            assert.equal(await T(page, "graph-run-open-native").isVisible(), true);
          if (run.id === "run-invalid-evidence")
            assert.equal(await T(page, "graph-run-evidence").getAttribute("data-state"), "invalid");
          if (run.id === "run-malformed-reviewer")
            assert.equal(await T(page, "graph-run-inspect-output").isVisible(), true);
          if (run === stale)
            assert.equal(
              await T(page, "graph-run-execution").getAttribute("data-state"),
              "StaleEvidence",
            );
          if (run === rejected)
            assert.equal(await T(page, "graph-run-human").getAttribute("data-state"), "rejected");
          if (run === fingerprint) {
            assert.equal(await T(page, "graph-routing-progress").isVisible(), true);
            assert.ok(
              !(await page.locator("[data-view]").innerText()).includes("raw-fingerprint-hidden"),
            );
          }
          if (run === consumed) assert.equal(await T(page, "graph-route-continue").count(), 0);
          if (run === missing) {
            assert.equal(await T(page, "graph-run-evidence").getAttribute("data-state"), "invalid");
            assert.equal(await T(page, "graph-run-inspect-invalid").isVisible(), true);
          }
          if (run.id === "run-valid-needs_changes")
            assert.equal(
              await T(page, "graph-run-structured-output").getAttribute("data-state"),
              "needs_changes",
            );
        }
      }
      assertClean(host);
    },
  };
}
