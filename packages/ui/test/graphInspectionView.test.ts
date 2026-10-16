import assert from "node:assert/strict";
import test from "node:test";
import type { GraphInspection } from "@zcode/services";
import { graphInspectionView } from "../src/graph-engineering/graphInspectionView.js";

type Status = GraphInspection["status"];
const all: Status[] = [
  "review-ready",
  "verifying-sources",
  "awaiting-permission",
  "running",
  "succeeded",
  "denied",
  "cancelled",
  "expired",
  "source-changed",
  "runtime-changed",
  "invalid-output",
  "failed",
  "executor-lost",
  "unavailable",
];
// Host 语义：这些状态占用工作区（reserved）；executor-lost 保持占用，直到原进程退出得到确认。
const reservedStatuses: Status[] = [
  "verifying-sources",
  "awaiting-permission",
  "running",
  "executor-lost",
];

test("without a record the operator sees the side-effect notice, selects and one primary Inspect action", () => {
  const view = graphInspectionView({});
  assert.deepEqual(view, {
    notice: true,
    locked: false,
    conversation: false,
    permissionInstruction: false,
    start: false,
    review: true,
    refresh: false,
    cancel: false,
    attention: false,
    reviewIsPrimary: true,
  });
});

test("a permission conversation and instruction exist only while a native permission can exist", () => {
  for (const status of all) {
    const view = graphInspectionView({
      status,
      reserved: reservedStatuses.includes(status),
      hasSession: true,
    });
    assert.equal(
      view.conversation,
      status === "awaiting-permission" || status === "running",
      `${status} conversation action`,
    );
    assert.equal(view.permissionInstruction, status === "awaiting-permission", `${status} prompt`);
  }
  // Source verification must never tell the user to answer a prompt that does not exist.
  const verifying = graphInspectionView({
    status: "verifying-sources",
    reserved: true,
    hasSession: true,
  });
  assert.equal(verifying.conversation, false);
  assert.equal(verifying.permissionInstruction, false);
  // No session or no navigation callback: nothing to open even during a real wait.
  assert.equal(
    graphInspectionView({ status: "awaiting-permission", reserved: true }).conversation,
    false,
  );
});

test("an owned operation always keeps status and cancel recovery, including lost executor ownership", () => {
  for (const status of reservedStatuses) {
    const view = graphInspectionView({ status, reserved: true });
    assert.equal(view.refresh, true, `${status} can check the original operation`);
    assert.equal(view.cancel, true, `${status} can be cancelled`);
    assert.equal(view.review, false, `${status} cannot start a second review`);
    assert.equal(view.locked, true, `${status} selection is fixed`);
    assert.equal(view.notice, false, `${status} authorization notice yields to the stage`);
  }
  assert.equal(graphInspectionView({ status: "executor-lost", reserved: true }).attention, true);
});

test("a review waiting for confirmation offers Start and Cancel, and settled records offer neither", () => {
  const ready = graphInspectionView({ status: "review-ready", reserved: false });
  assert.equal(ready.start, true);
  assert.equal(ready.cancel, true);
  assert.equal(ready.refresh, false);
  assert.equal(ready.notice, true, "the exact side-effect disclosure stays before authorization");
  assert.equal(ready.reviewIsPrimary, false, "confirming is the one primary action");
  for (const status of all.filter((value) => !reservedStatuses.includes(value))) {
    if (status === "review-ready") continue;
    const view = graphInspectionView({ status, reserved: false });
    assert.equal(view.start, false, status);
    assert.equal(view.cancel, false, status);
    assert.equal(view.refresh, false, status);
    assert.equal(view.review, true, `${status} can be inspected again`);
    assert.equal(view.reviewIsPrimary, true, status);
  }
});

test("failures, expiry and denial are marked for attention; progress, success and own cancellation are not", () => {
  const attention = all.filter(
    (status) =>
      graphInspectionView({ status, reserved: reservedStatuses.includes(status) }).attention,
  );
  assert.deepEqual(attention, [
    "denied",
    "expired",
    "source-changed",
    "runtime-changed",
    "invalid-output",
    "failed",
    "executor-lost",
    "unavailable",
  ]);
  assert.equal(
    graphInspectionView({ status: "failed", busy: true }).attention,
    false,
    "a transient status read is not a failure",
  );
});

test("a preset selection is shown as one summary line, never as disabled controls", () => {
  assert.equal(graphInspectionView({ fixedSelection: true }).locked, true);
  assert.equal(graphInspectionView({ status: "denied", fixedSelection: true }).review, true);
});
