import assert from "node:assert/strict";
import path from "node:path";
import { assertU3Profile } from "./pre-z8-u3-fixture.mjs";

export function u3DialogSelection(home, result) {
  assert.equal(typeof result.canceled, "boolean");
  assert.ok(Array.isArray(result.filePaths));
  if (result.canceled)
    assert.equal(result.filePaths.length, 0, "Cancellation cannot carry a selected path.");
  else
    assert.equal(result.filePaths.length, 1, "The controlled picker must select exactly one file.");
  for (const selected of result.filePaths) {
    assert.equal(typeof selected, "string");
    const relative = path.relative(path.resolve(home), path.resolve(selected));
    assert.ok(
      relative &&
        !relative.startsWith(`..${path.sep}`) &&
        relative !== ".." &&
        !path.isAbsolute(relative),
      "Picker response must stay within its owned profile.",
    );
  }
  return structuredClone(result);
}

/** Approved platform test seam only. No renderer state, service or runtime result is injected. */
export async function withU3DialogFixture(isolation, observe) {
  const home = await assertU3Profile(isolation);
  await isolation.app.evaluate(({ dialog }) => {
    if (globalThis.__preZ8U3Dialog) throw new Error("An owned U3 dialog seam already exists.");
    const state = { original: dialog.showOpenDialog, queued: [], calls: [], pending: null };
    state.wrapper = async (...args) => {
      const entry = state.queued.shift();
      if (!entry) throw new Error("Unplanned native file picker in isolated U3 acceptance.");
      const options = args.at(-1);
      state.calls.push({
        properties: options?.properties,
        defaultPath: options?.defaultPath,
        response: entry.result,
        controlled: true,
        held: entry.hold,
      });
      if (entry.hold) {
        if (state.pending) throw new Error("Only one held U3 picker is permitted.");
        return new Promise((resolve) => {
          state.pending = { resolve, result: entry.result };
        });
      }
      return entry.result;
    };
    globalThis.__preZ8U3Dialog = state;
    dialog.showOpenDialog = state.wrapper;
  });
  const control = {
    queue: async (result, { hold = false } = {}) => {
      const selected = u3DialogSelection(home, result);
      await isolation.app.evaluate(
        (_electron, entry) => {
          const state = globalThis.__preZ8U3Dialog;
          if (!state || state.queued.length || state.pending)
            throw new Error("Unexpected dialog fixture queue state.");
          state.queued.push(entry);
        },
        { result: selected, hold },
      );
    },
    calls: () => isolation.app.evaluate(() => structuredClone(globalThis.__preZ8U3Dialog.calls)),
    release: () =>
      isolation.app.evaluate(() => {
        const state = globalThis.__preZ8U3Dialog;
        if (!state?.pending) throw new Error("No owned held picker to release.");
        state.pending.resolve(state.pending.result);
        state.pending = null;
      }),
  };
  try {
    return await observe(control);
  } finally {
    await isolation.app.evaluate(({ dialog }) => {
      const state = globalThis.__preZ8U3Dialog;
      if (!state || dialog.showOpenDialog !== state.wrapper)
        throw new Error("Refusing to restore another dialog owner.");
      if (state.pending) state.pending.resolve({ canceled: true, filePaths: [] });
      dialog.showOpenDialog = state.original;
      delete globalThis.__preZ8U3Dialog;
    });
  }
}
