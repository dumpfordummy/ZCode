// Z8.3-S1 UI-side tests: preview byte count, explicit Save through the existing save-file boundary, cancel, errors.
// FIXTURES: a synthetic temporary Graph profile built from an unmodified historical fixture record (read-only copy).
// FAKE (labelled): `fakeMainSave` stands in for Main's registerDesktopSaveFileIpcHandler (Electron cannot run in the
// portable CI). It mirrors that handler's documented contract: cancel -> { success:false, canceled:true } and writes
// nothing; confirm -> writes `new Uint8Array(payload.data)` to the chosen path. Source-text guards below (labelled)
// check that the real handler and the Help-menu wiring still have that shape. No network is used anywhere.
import assert from "node:assert/strict";
import { access, cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  resolveGraphSupportBundlePolicy,
  type SaveFileRequest,
  type SaveFileResult,
} from "@zcode/shared";
import type { GraphSupportBundleResult } from "@zcode/services";
import { createGraphRepository } from "../../services/src/graph-engineering/adapters/repository.js";
import { createGraphSupportService } from "../../services/src/graph-engineering/adapters/support-bundle.js";
import { GraphSupportBundleError } from "../../services/src/graph-engineering/domain/support-bundle.js";
import enUS from "../src/i18n/locales/en-US.js";
import zhCN from "../src/i18n/locales/zh-CN.js";
import { GRAPH_S1_MESSAGE_KEYS } from "../src/i18n/locales/graphS1.js";
import {
  GRAPH_SUPPORT_BUNDLE_AVAILABLE,
  SUPPORT_BUNDLE_FILE_NAME,
  generateSupportBundle,
  createSupportBundleController,
  prepareSupportBundle,
  saveSupportBundle,
  supportBundleErrorId,
} from "../src/graph-engineering/supportBundle.js";

const historical = fileURLToPath(
  new URL("../../../docs/graph-engineering/z8/fixtures/historical/", import.meta.url),
);

async function syntheticBundle(): Promise<{ result: GraphSupportBundleResult; root: string }> {
  const root = await mkdtemp(join(tmpdir(), "zcode-s1-ui-"));
  const graphDir = join(root, "graph-engineering");
  await cp(join(historical, "z22-completed-sequential", "graph-engineering"), graphDir, {
    recursive: true,
  });
  const builder = createGraphSupportService({
    directory: graphDir,
    repository: createGraphRepository(graphDir),
    flavor: "graph",
  });
  return { result: await builder.supportBundle(), root };
}

/** FAKE of Main's save-file handler; `decision` is what the user does in the OS dialog. */
function fakeMainSave(destination: string, decision: "confirm" | "cancel") {
  const calls: SaveFileRequest[] = [];
  return {
    calls,
    async saveFile(payload: SaveFileRequest): Promise<SaveFileResult> {
      calls.push(payload);
      if (decision === "cancel") return { success: false, canceled: true };
      await writeFile(destination, new Uint8Array(payload.data!));
      return { success: true, path: destination };
    },
  };
}

test("the displayed byte count equals the exact bytes handed to the save boundary and written by it", async () => {
  const { result, root } = await syntheticBundle();
  try {
    const prepared = prepareSupportBundle(result);
    assert.equal(prepared.byteLength, result.byteLength);
    assert.equal(prepared.byteLength, Buffer.byteLength(result.json, "utf8"));
    const destination = join(root, "saved.json");
    const main = fakeMainSave(destination, "confirm");
    assert.deepEqual(main.calls, [], "nothing is saved before an explicit Save");
    const outcome = await saveSupportBundle(main, prepared);
    assert.deepEqual(outcome, { status: "saved", path: destination });
    assert.equal(main.calls.length, 1);
    assert.equal(main.calls[0]!.suggestedName, SUPPORT_BUNDLE_FILE_NAME);
    assert.equal(main.calls[0]!.data!.byteLength, prepared.byteLength);
    const onDisk = await readFile(destination);
    assert.equal(onDisk.byteLength, prepared.byteLength);
    assert.deepEqual(
      onDisk,
      Buffer.from(result.json, "utf8"),
      "the file is exactly the previewed text",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a cancelled save writes nothing and shows nothing; the preview stays valid for another try", async () => {
  const { result, root } = await syntheticBundle();
  try {
    const destination = join(root, "never.json");
    const main = fakeMainSave(destination, "cancel");
    const outcome = await saveSupportBundle(main, prepareSupportBundle(result));
    assert.deepEqual(outcome, { status: "canceled" });
    await assert.rejects(access(destination), "no destination file exists");
    assert.deepEqual(
      (await readdir(root)).sort(),
      ["graph-engineering"],
      "nothing else was written next to the profile",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("byte counts are UTF-8 bytes, and a size mismatch is refused before any save", () => {
  const base = { schema: "zcode.graph.support-bundle", schemaVersion: 1, sections: [] } as const;
  const json = '{"label":"é中😀"}\n';
  const bytes = new TextEncoder().encode(json).byteLength;
  assert.ok(bytes > json.length, "multi-byte text is longer in bytes than in characters");
  assert.equal(prepareSupportBundle({ ...base, json, byteLength: bytes }).byteLength, bytes);
  assert.throws(
    () => prepareSupportBundle({ ...base, json, byteLength: json.length }),
    /did not match/,
  );
  assert.throws(() => prepareSupportBundle({ ...base, json: "", byteLength: 0 }), /did not match/);
});

test("generation failure shows a readable local error and never reaches the save boundary", async () => {
  for (const [error, expected] of [
    [new GraphSupportBundleError("profile-unreadable"), "profile-unreadable"],
    [new GraphSupportBundleError("too-large"), "too-large"],
    [new GraphSupportBundleError("privacy-check-failed"), "privacy-check-failed"],
    [new GraphSupportBundleError("unavailable"), "unavailable"],
    [new Error("EACCES: open '/home/canary-user/.zcode/ZXCANARY'"), "generic"],
  ] as const) {
    const outcome = await generateSupportBundle({
      supportBundle: async () => {
        throw error;
      },
    });
    assert.deepEqual(outcome, { status: "error", errorId: expected });
    assert.equal(supportBundleErrorId(error), expected);
  }
  assert.deepEqual(await generateSupportBundle(undefined), {
    status: "error",
    errorId: "unavailable",
  });
  // A Host result that does not match its own size is an error too, not a savable preview.
  const mismatched = await generateSupportBundle({
    supportBundle: async () => ({
      schema: "zcode.graph.support-bundle",
      schemaVersion: 1,
      json: "{}\n",
      byteLength: 99,
      sections: [],
    }),
  });
  assert.deepEqual(mismatched, { status: "error", errorId: "mismatch" });
  // A save failure is reported with Main's fixed code and nothing else.
  const failure = await saveSupportBundle(
    { saveFile: async () => ({ success: false, error: "write_failed" }) },
    prepareSupportBundle({
      schema: "zcode.graph.support-bundle",
      schemaVersion: 1,
      json: "{}\n",
      byteLength: 3,
      sections: [],
    }),
  );
  assert.deepEqual(failure, { status: "error", errorId: "save-failed", code: "write_failed" });
  assert.deepEqual(
    await saveSupportBundle(
      {},
      prepareSupportBundle({
        schema: "zcode.graph.support-bundle",
        schemaVersion: 1,
        json: "{}\n",
        byteLength: 3,
        sections: [],
      }),
    ),
    { status: "error", errorId: "save-failed" },
  );
});

test("Graph-only: the UI flag is the shared policy for the compiled flavor (non-Graph test build: hidden)", () => {
  assert.equal(
    GRAPH_SUPPORT_BUNDLE_AVAILABLE,
    resolveGraphSupportBundlePolicy("preview").available,
  );
  assert.equal(GRAPH_SUPPORT_BUNDLE_AVAILABLE, false);
  assert.equal(resolveGraphSupportBundlePolicy("graph").available, true);
  assert.equal(resolveGraphSupportBundlePolicy("production").available, false);
});

test("copy exists in English and Chinese with matching placeholders, and has no upload, submit, send or retry wording on any action", () => {
  const placeholders = (text: string) =>
    [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  for (const key of GRAPH_S1_MESSAGE_KEYS) {
    const id = `graph.s1.${key}`;
    assert.ok(enUS[id]?.trim(), `${id} missing in en-US`);
    assert.ok(zhCN[id]?.trim(), `${id} missing in zh-CN`);
    assert.deepEqual(placeholders(zhCN[id]!), placeholders(enUS[id]!), `${id} placeholders differ`);
  }
  for (const key of ["menu", "save", "saving", "regenerate", "close", "title"]) {
    assert.doesNotMatch(enUS[`graph.s1.${key}`]!, /upload|submit|send|retry/i, `${key} (en)`);
    assert.doesNotMatch(zhCN[`graph.s1.${key}`]!, /上传|提交|发送|重试/, `${key} (zh)`);
  }
});

test("SOURCE-TEXT GUARDS (labelled): Help-menu wiring, no network in the dialog, and the existing Main save handler shape", async () => {
  const read = (relative: string) =>
    readFile(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
  const menu = await read("../src/WorkspaceHelpMenuButton.tsx");
  assert.match(menu, /GRAPH_SUPPORT_BUNDLE_AVAILABLE\s*&&\s*Boolean\(platform\.saveFile\)/);
  assert.match(menu, /graphSupportService/);
  assert.match(
    menu,
    /FEEDBACK_SUBMISSION_AVAILABLE \?/,
    "the Feedback entries keep their Z8.3-N1 gate",
  );
  const dialog = await read("../src/graph-engineering/GraphSupportBundleDialog.tsx");
  const hook = await read("../src/hooks/useGraphSupportBundle.ts");
  const logic = await read("../src/graph-engineering/supportBundle.ts");
  for (const [name, source] of [
    ["dialog", dialog],
    ["hook", hook],
    ["logic", logic],
  ] as const)
    assert.doesNotMatch(
      source,
      /\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|openExternal|localStorage|writeFile/,
      name,
    );
  assert.equal(
    [...logic.matchAll(/\.saveFile\(/g)].length,
    1,
    "one save call site, in saveSupportBundle",
  );
  assert.equal(
    [...logic.matchAll(/saveSupportBundle\(/g)].length,
    2,
    "definition + controller call",
  );
  const main = await read("../../desktop/src/main/desktopSaveFile.ts");
  const dialogAt = main.indexOf("showSaveDialog");
  const canceledAt = main.indexOf("canceled: true");
  const writeAt = main.indexOf("writeFile(result.filePath, new Uint8Array(payload.data))");
  assert.ok(
    dialogAt > 0 && canceledAt > dialogAt && writeAt > canceledAt,
    "cancel returns before any write",
  );
});

test("controller: Save is only possible from a ready preview, happens once per click, and a failed generation never saves", async () => {
  const { result, root } = await syntheticBundle();
  try {
    const states: string[] = [];
    const destination = join(root, "controller.json");
    const main = fakeMainSave(destination, "confirm");
    const ready = createSupportBundleController({
      service: { supportBundle: async () => result },
      platform: main,
      onState: (state) => states.push(state.status),
    });
    await ready.save(); // idle: nothing to save
    assert.equal(main.calls.length, 0);
    await ready.generate();
    assert.equal(main.calls.length, 0, "generating a preview never saves");
    assert.deepEqual(states, ["generating", "ready"]);
    await ready.save();
    assert.equal(main.calls.length, 1);
    assert.deepEqual(states.slice(-2), ["saving", "ready"]);
    const final = ready.getState();
    assert.equal(final.status === "ready" && final.saved?.path, destination);
    ready.reset();
    await ready.save();
    assert.equal(main.calls.length, 1, "after closing, Save is a no-op");

    const failing = fakeMainSave(join(root, "failed.json"), "confirm");
    const broken = createSupportBundleController({
      service: {
        supportBundle: async () => {
          throw new GraphSupportBundleError("profile-unreadable");
        },
      },
      platform: failing,
      onState: () => {},
    });
    await broken.generate();
    await broken.save();
    assert.deepEqual(broken.getState(), { status: "error", errorId: "profile-unreadable" });
    assert.equal(failing.calls.length, 0, "no save call when generation failed");
    await assert.rejects(access(join(root, "failed.json")), "and no destination file");

    const cancelled = fakeMainSave(join(root, "cancelled.json"), "cancel");
    const second = createSupportBundleController({
      service: { supportBundle: async () => result },
      platform: cancelled,
      onState: () => {},
    });
    await second.generate();
    await second.save();
    const state = second.getState();
    assert.equal(state.status, "ready");
    assert.equal(state.status === "ready" && state.saved, undefined, "cancel shows no result");
    assert.equal(state.status === "ready" && state.saveError, undefined);
    await assert.rejects(access(join(root, "cancelled.json")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
