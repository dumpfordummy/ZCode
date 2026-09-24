import assert from "node:assert/strict";
import test from "node:test";
import {
  parseGraphJson,
  parseBoundedGraphJson,
  selectGraphJsonPath,
  validateGraphJsonSchema,
} from "../domain/artifacts.js";
import type { GraphJsonSchema } from "../artifact-types.js";

const schema: GraphJsonSchema = {
  type: "object",
  properties: {
    outcome: { type: "string", enum: ["pass", "needs_changes"] },
    findings: { type: "array", items: { type: "string" }, maxItems: 2 },
  },
  required: ["outcome", "findings"],
  additionalProperties: false,
};
test("strict output preserves typed object and rejects prose, trailing data, duplicate escaped keys", () => {
  assert.deepEqual(parseGraphJson('{"outcome":"pass","findings":[]}', schema), {
    outcome: "pass",
    findings: [],
  });
  for (const value of [
    "```json\n{}\n```",
    "{} {}",
    "prefix {}",
    '{"x":1,"x":2}',
    '{"a":1,"\\u0061":2}',
    '{"n":{"x":1,"x":2}}',
    "[1]",
    '{"n":1e999}',
  ])
    assert.throws(() => parseGraphJson(value, schema));
});
test("strict output bounds depth/bytes/members and validates declared shape without repair", () => {
  assert.throws(
    () => parseBoundedGraphJson('{"x":' + "[".repeat(18) + "0" + "]".repeat(18) + "}"),
    /depth/,
  );
  assert.throws(() => parseBoundedGraphJson(JSON.stringify({ text: "界".repeat(100000) })), /byte/);
  assert.throws(
    () => parseBoundedGraphJson(JSON.stringify({ values: Array(4097).fill(1) })),
    /member/,
  );
  for (const value of [
    '{"outcome":"pass"}',
    '{"outcome":"other","findings":[]}',
    '{"outcome":"pass","findings":[],"extra":1}',
    '{"outcome":"pass","findings":[1]}',
  ])
    assert.throws(() => parseGraphJson(value, schema));
  assert.throws(
    () =>
      validateGraphJsonSchema({
        type: "object",
        properties: {},
        required: [],
        additionalProperties: true,
      }),
    /schema/,
  );
  assert.throws(() => validateGraphJsonSchema({ type: "string", pattern: "eval" }), /schema/);
  assert.throws(
    () => validateGraphJsonSchema({ type: "string", enum: ["x".repeat(32768)] }),
    /32 KiB/,
  );
});
test("JSON pointers use own properties, escaped segments and canonical indices only", () => {
  const value = parseBoundedGraphJson('{"a/b":{"~key":["ok"]}}');
  assert.equal(selectGraphJsonPath(value, "/a~1b/~0key/0"), "ok");
  for (const path of ["constructor", "/constructor", "/a~1b/~0key/00", "/a~2b", "/a~1b/~0key/-1"])
    assert.throws(() => selectGraphJsonPath(value, path));
});
test("reserved object keys are rejected in JSON, schema properties and decoded pointers", () => {
  for (const key of ["__proto__", "constructor", "prototype"]) {
    assert.throws(() => parseBoundedGraphJson(JSON.stringify({ [key]: true })), /reserved/i);
    assert.throws(
      () =>
        validateGraphJsonSchema({
          type: "object",
          properties: { [key]: { type: "boolean" } },
          required: [key],
          additionalProperties: false,
        }),
      /reserved/i,
    );
    assert.throws(() => selectGraphJsonPath({ [key]: true }, `/${key}`), /reserved/i);
  }
  assert.throws(() => parseBoundedGraphJson('{"\\u005f_proto__":1}'), /reserved/i);
});
