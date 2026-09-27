import assert from "node:assert/strict";
import test from "node:test";
import {
  selectGraphReference,
  beginGraphReferenceIntent,
  beginGraphReferenceSearch,
  invalidateGraphReferenceReads,
} from "../src/graph-engineering/graphReferenceSelection.js";

test("cancelled, failed and late reference selection preserves existing binding", async () => {
  let reads = 0,
    current = true;
  const validate = async (path: string) => {
    reads++;
    return { path };
  };
  assert.equal(
    await selectGraphReference({ pick: async () => null, validate, isCurrent: () => true }),
    undefined,
  );
  assert.equal(reads, 0);
  await assert.rejects(
    selectGraphReference({
      pick: async () => "missing.md",
      validate: async () => {
        throw new Error("missing");
      },
      isCurrent: () => true,
    }),
  );
  let finish!: (value: string) => void;
  const pending = selectGraphReference({
    pick: () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
    validate,
    isCurrent: () => current,
  });
  current = false;
  finish("old-workspace.md");
  assert.equal(await pending, undefined);
  assert.equal(reads, 0);
});

test("selection is checked again after validation before returning a mutation candidate", async () => {
  let current = true;
  assert.equal(
    await selectGraphReference({
      pick: async () => "guide.md",
      validate: async () => {
        current = false;
        return { path: "guide.md" };
      },
      isCurrent: () => current,
    }),
    undefined,
  );
  assert.deepEqual(
    await selectGraphReference({
      pick: async () => "guide.md",
      validate: async (path) => ({ path: `relative/${path}` }),
      isCurrent: () => true,
    }),
    { path: "relative/guide.md" },
  );
});
test("a newer cancelled picker invalidates the older delayed intent", async () => {
  const scope = { generation: 0 };
  let finish!: (path: string) => void,
    reads = 0;
  const validate = async (path: string) => {
    reads++;
    return path;
  };
  const older = selectGraphReference({
    pick: () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
    validate,
    isCurrent: beginGraphReferenceIntent(scope),
  });
  assert.equal(
    await selectGraphReference({
      pick: async () => null,
      validate,
      isCurrent: beginGraphReferenceIntent(scope),
    }),
    undefined,
  );
  finish("old.md");
  assert.equal(await older, undefined);
  assert.equal(reads, 0);
});

test("pending search completes after a separate picker is cancelled", async () => {
  const scope = { generation: 0, searchSequence: 0 };
  let finishSearch!: (value: string[]) => void;
  let state: { loading: boolean; files: string[] } = { loading: true, files: [] };
  const searchCurrent = beginGraphReferenceSearch(scope);
  const pendingSearch = new Promise<string[]>((resolve) => {
    finishSearch = resolve;
  }).then((files) => {
    if (searchCurrent()) state = { loading: false, files };
  });
  await selectGraphReference({
    pick: async () => null,
    validate: async (path) => path,
    isCurrent: beginGraphReferenceIntent(scope),
  });
  finishSearch(["guide.md"]);
  await pendingSearch;
  assert.deepEqual(state, { loading: false, files: ["guide.md"] });
});

test("newest search wins its lane without cancelling a pending selection; lifecycle invalidates both", async () => {
  const scope = { generation: 0, searchSequence: 0 };
  let finishPicker!: (path: string) => void;
  const selectionCurrent = beginGraphReferenceIntent(scope);
  const pendingPicker = selectGraphReference({
    pick: () =>
      new Promise<string>((resolve) => {
        finishPicker = resolve;
      }),
    validate: async (path) => path,
    isCurrent: selectionCurrent,
  });
  const firstSearch = beginGraphReferenceSearch(scope),
    secondSearch = beginGraphReferenceSearch(scope);
  assert.equal(firstSearch(), false);
  assert.equal(secondSearch(), true);
  assert.equal(selectionCurrent(), true);
  finishPicker("selected.md");
  assert.equal(await pendingPicker, "selected.md");
  invalidateGraphReferenceReads(scope);
  assert.equal(selectionCurrent(), false);
  assert.equal(secondSearch(), false);
});
