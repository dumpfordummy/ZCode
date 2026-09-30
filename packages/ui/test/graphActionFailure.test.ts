import assert from "node:assert/strict";
import test from "node:test";
import { graphAdmissionFailure } from "../src/graph-engineering/graphActionFailure.js";

test("only admission-path failures reach the New-run and review bars, verbatim", () => {
  assert.deepEqual(graphAdmissionFailure("Native environment unavailable.", "review"), {
    kind: "review",
    message: "Native environment unavailable.",
  });
  assert.deepEqual(graphAdmissionFailure("Refused.", "start"), {
    kind: "start",
    message: "Refused.",
  });
  // UX-M1.4 与 UX-M2.3：检查保存、设计保存与未标注的操作（取消、决定、恢复）不显示在 Review and run 旁边。
  for (const source of ["checks", "design", undefined] as const)
    assert.equal(graphAdmissionFailure("Some failure.", source), undefined, String(source));
  assert.equal(graphAdmissionFailure(null, "review"), undefined);
  assert.equal(graphAdmissionFailure("", "start"), undefined);
});
