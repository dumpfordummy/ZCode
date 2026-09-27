import assert from "node:assert/strict";
import test from "node:test";
import { replaceGraphFromTemplate } from "../src/graph-engineering/graphTemplateReplacement.js";

test("Cancel and failed Save never instantiate or discard the original draft", async () => {
  const calls: string[] = [];
  const operations = {
    expectedRevision: 3,
    stillCurrent: () => true,
    save: async () => {
      calls.push("save");
      return undefined;
    },
    instantiate: async (revision: number) => {
      calls.push(`instantiate:${revision}`);
      return "accepted";
    },
  };
  assert.equal(await replaceGraphFromTemplate({ ...operations, decision: "cancel" }), undefined);
  assert.equal(await replaceGraphFromTemplate({ ...operations, decision: "save" }), undefined);
  assert.deepEqual(calls, ["save"]);
});

test("Save uses its acknowledged revision and Discard does not save the draft", async () => {
  const calls: string[] = [];
  const operations = {
    expectedRevision: 3,
    stillCurrent: () => true,
    save: async () => {
      calls.push("save");
      return { revision: 4 };
    },
    instantiate: async (revision: number) => {
      calls.push(`instantiate:${revision}`);
      return "accepted";
    },
  };
  assert.equal(await replaceGraphFromTemplate({ ...operations, decision: "save" }), "accepted");
  assert.equal(await replaceGraphFromTemplate({ ...operations, decision: "discard" }), "accepted");
  assert.deepEqual(calls, ["save", "instantiate:4", "instantiate:3"]);
});

test("changing workspace or reviewed content during Save invalidates replacement consent", async () => {
  let current = true;
  let instantiated = false;
  assert.equal(
    await replaceGraphFromTemplate({
      decision: "save",
      expectedRevision: 3,
      stillCurrent: () => current,
      save: async () => {
        current = false;
        return { revision: 4 };
      },
      instantiate: async () => {
        instantiated = true;
        return "wrong";
      },
    }),
    undefined,
  );
  assert.equal(instantiated, false);
});
