// Z8.3-N1 UI-side tests (pure store / pure function; no DOM, no network).
import assert from "node:assert/strict";
import test from "node:test";
import { resolveFeedbackSubmissionPolicy } from "@zcode/shared";
import { FEEDBACK_SUBMISSION_AVAILABLE } from "../src/feedback/feedbackAvailability.js";
import { createFeedbackUiStore } from "../src/feedback/feedbackStore.js";
import { claimMarketplaceAutoRefresh } from "../src/settings/officialMarketplaceAutoRefresh.js";

test("the UI availability flag is the shared Feedback policy for the compiled flavor (non-Graph test build: available)", () => {
  assert.equal(
    FEEDBACK_SUBMISSION_AVAILABLE,
    resolveFeedbackSubmissionPolicy(
      // The test process has no Graph define, so it resolves to a supported flavor.
      "preview",
    ).allowed,
  );
});

test("Graph feedback store: every opener is a no-op, so no Feedback dialog can appear", () => {
  const store = createFeedbackUiStore(false);
  const before = store.getState();
  store.getState().openSubmit({ title: "synthetic", includeLogs: true });
  store.getState().openFeatureRequest();
  store.getState().openTickets("T-1");
  store.getState().openSubmissionJob("job-1");
  const after = store.getState();
  assert.equal(after.open, false);
  assert.equal(after.featureRequestOpen, false);
  assert.equal(after.submitDraft, null);
  assert.equal(after.submissionJobId, null);
  assert.equal(after.selectedTicketId, null);
  assert.equal(before.tab, after.tab);
});

test("positive control: the non-Graph feedback store still opens every dialog", () => {
  const store = createFeedbackUiStore(true);
  store.getState().openSubmit({ title: "synthetic" });
  assert.equal(store.getState().open, true);
  assert.equal(store.getState().submitDraft?.title, "synthetic");
  store.getState().openFeatureRequest();
  assert.equal(store.getState().featureRequestOpen, true);
  store.getState().openTickets("T-1");
  assert.equal(store.getState().selectedTicketId, "T-1");
  store.getState().close();
  store.getState().openSubmissionJob("job-1");
  assert.equal(store.getState().submissionJobId, "job-1");
});

test("Plugin Store catalog auto-refresh: denied policy never claims a refresh and never records an attempt", () => {
  const old = "2000-01-01T00:00:00.000Z";
  assert.equal(claimMarketplaceAutoRefresh("m-denied", old, Date.now(), false), false);
  assert.equal(
    claimMarketplaceAutoRefresh("m-denied", undefined, Date.now() + 10 * 60 * 60_000, false),
    false,
  );
  // The denial did not occupy the throttle slot: the same marketplace is claimable once policy allows it.
  assert.equal(claimMarketplaceAutoRefresh("m-denied", old, Date.now(), true), true);
});

test("positive control: allowed policy keeps the existing throttle (claim once, then blocked inside the window)", () => {
  const now = Date.now();
  assert.equal(claimMarketplaceAutoRefresh("m-allowed", undefined, now, true), true);
  assert.equal(claimMarketplaceAutoRefresh("m-allowed", undefined, now + 1_000, true), false);
});
