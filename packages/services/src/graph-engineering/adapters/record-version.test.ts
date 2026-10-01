import assert from "node:assert/strict";
import test from "node:test";
import { recordSchema } from "../domain/record.js";
import {
  GraphRecordUnsupportedVersionError,
  MAX_SUPPORTED_RECORD_VERSION,
  boundedDiagnostic,
  findNewerRecordVersion,
} from "../domain/record-version.js";

test("the declared maximum matches what the strict record schema actually accepts", () => {
  const versionIssue = (version: number) =>
    recordSchema
      .safeParse({ version, workspaceKey: "k", definition: {}, runs: [] })
      .error?.issues.some((issue) => issue.path[0] === "version") ?? false;
  assert.equal(versionIssue(MAX_SUPPORTED_RECORD_VERSION), false);
  assert.equal(versionIssue(MAX_SUPPORTED_RECORD_VERSION + 1), true);
  assert.equal(versionIssue(0), true);
});

test("only an integer version beyond the supported range counts as newer", () => {
  const newer = MAX_SUPPORTED_RECORD_VERSION + 1;
  assert.deepEqual(findNewerRecordVersion({ version: newer }), {
    location: "version",
    version: newer,
  });
  assert.deepEqual(findNewerRecordVersion({ version: 3, definition: { version: 9 } }), {
    location: "definition.version",
    version: 9,
  });
  assert.deepEqual(findNewerRecordVersion({ version: 3, runs: [{ version: 2 }, { version: 7 }] }), {
    location: "runs[1].version",
    version: 7,
  });
  for (const json of [
    null,
    "text",
    { version: MAX_SUPPORTED_RECORD_VERSION },
    { version: "6" },
    { version: 6.5 },
    { version: -1 },
    { version: 3, definition: null, runs: "not-an-array" },
    { version: 3, unknown: { version: 99 } },
  ])
    assert.equal(findNewerRecordVersion(json), undefined, JSON.stringify(json));
});

test("the unsupported-version error is readable and bounded, names the guidance and keeps the diagnostic", () => {
  const issues = Array.from({ length: 20 }, (_, index) => ({
    path: ["runs", index, "x"],
    message: "m".repeat(400),
  }));
  const diagnostic = boundedDiagnostic(issues);
  assert.ok(diagnostic.length <= 2000);
  assert.match(diagnostic, /^runs\.0\.x: /);
  const error = new GraphRecordUnsupportedVersionError(
    { location: "version", version: 9 },
    diagnostic,
  );
  assert.match(error.message, /newer, unsupported ZCode Graph version/);
  assert.match(error.message, /GRAPH_DATA_OPERATIONS\.md/);
  assert.match(error.message, /Nothing was changed or started/);
  assert.equal(error.code, "GRAPH_RECORD_UNSUPPORTED_VERSION");
  assert.equal(error.diagnostic, diagnostic);
  assert.ok(error.message.length < 700);
});
