import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { root } from "./isolation.mjs";
import {
  prepareU3Fixture,
  U3_INSTRUCTIONS,
  U3_REFERENCE,
  U3_ORIGINAL_INSTRUCTIONS,
} from "./pre-z8-u3-fixture.mjs";
import {
  u3FixtureOutputs,
  u3Response,
  U3_BRACES,
  U3_LATER_INPUT,
  U3_LATER_OUTPUT,
} from "./pre-z8-u3-provider.mjs";
import { u3DialogSelection } from "./pre-z8-u3-dialog.mjs";

async function fixture(run) {
  const home = path.join(root, ".tmp", `z1-native-${Date.now()}-${randomUUID().slice(0, 6)}`);
  const workspace = path.join(home, "workspace");
  await mkdir(workspace, { recursive: true });
  await writeFile(path.join(workspace, "AGENTS.md"), U3_ORIGINAL_INSTRUCTIONS);
  await writeFile(path.join(workspace, "fixture.mjs"), "export const marker = 'Z1_BEFORE_7391';\n");
  try {
    await run({ home, workspace });
  } finally {
    assert.equal(path.dirname(await realpath(home)), await realpath(path.join(root, ".tmp")));
    assert.match(path.basename(home), /^z1-native-\d+-[a-f0-9]{6}$/);
    await rm(home, { recursive: true, force: true });
  }
}

test("U3 fixture creates only owned inert reference files and preserves native source", async () =>
  fixture(async (owner) => {
    const before = await readFile(path.join(owner.workspace, "fixture.mjs"));
    const receipt = await prepareU3Fixture(owner);
    assert.equal(await readFile(path.join(owner.workspace, "AGENTS.md"), "utf8"), U3_INSTRUCTIONS);
    assert.equal(
      await readFile(path.join(owner.workspace, "docs/context-note.md"), "utf8"),
      U3_REFERENCE,
    );
    assert.equal(
      await readFile(path.join(owner.workspace, "docs/same-content.md"), "utf8"),
      U3_INSTRUCTIONS,
    );
    assert.deepEqual(await readFile(path.join(owner.workspace, "fixture.mjs")), before);
    assert.equal(receipt.executedCommands, 0);
    assert.equal(receipt.files.length, 4);
    await assert.rejects(prepareU3Fixture(owner), /already|reuse/i);
  }));

test("U3 fixture refuses unexpected instruction bytes before writing new references", async () =>
  fixture(async (owner) => {
    const foreign = "Existing unrelated instructions must survive.\n";
    await writeFile(path.join(owner.workspace, "AGENTS.md"), foreign);
    await assert.rejects(prepareU3Fixture(owner), /instruction|fixture/i);
    assert.equal(await readFile(path.join(owner.workspace, "AGENTS.md"), "utf8"), foreign);
    await assert.rejects(readFile(path.join(owner.workspace, "docs/context-note.md")), {
      code: "ENOENT",
    });
  }));

test("U3 fixture rejects workspace escape before touching either owner", async () =>
  fixture(async (owner) => {
    await assert.rejects(
      prepareU3Fixture({ ...owner, workspace: root }),
      /owned|workspace|boundary/i,
    );
    assert.equal(
      await readFile(path.join(owner.workspace, "AGENTS.md"), "utf8"),
      U3_ORIGINAL_INSTRUCTIONS,
    );
  }));

const tools = ["Read", "Edit", "AskUserQuestion"].map((name) => ({ function: { name } }));
const outputs = u3FixtureOutputs("U3_TEST");
const source = "C:/owned/workspace";
const user = (content) => ({ role: "user", content });
const body = (messages) => ({ tools, messages });

test("U3 controlled actual Analyze output preserves literal token-like braces", () => {
  const reply = u3Response({
    body: body([
      user("Workflow task: analyze."),
      {
        role: "tool",
        tool_call_id: "pre_z8_u1_analyze_read",
        content: "export const marker = 'Z1_BEFORE_7391';",
      },
    ]),
    workspace: source,
    outputs,
  });
  assert.equal(reply.content, outputs.analyze);
  assert.ok(reply.content.includes(U3_BRACES));
});

test("U3 provider accepts one exact predecessor and rejects missing or duplicated handoffs", () => {
  const valid = `Workflow task: implement.\n${outputs.analyze}`;
  assert.equal(
    u3Response({ body: body([user(valid)]), workspace: source, outputs }).call.name,
    "Read",
  );
  for (const invalid of ["Workflow task: implement.", `${valid}\n${outputs.analyze}`])
    assert.throws(
      () => u3Response({ body: body([user(invalid)]), workspace: source, outputs }),
      /handoff|once/i,
    );
});

test("U3 later Chat reply requires the exact latest explicit follow-up, never historical text", () => {
  assert.equal(
    u3Response({ body: body([user(U3_LATER_INPUT)]), workspace: source, outputs }).content,
    U3_LATER_OUTPUT,
  );
  assert.throws(
    () =>
      u3Response({
        body: body([user(U3_LATER_INPUT), user("Unrecognized new instruction")]),
        workspace: source,
        outputs,
      }),
    /Unrecognized/,
  );
});

test("U3 dialog responses stay within the owned profile and never turn cancellation into selection", () => {
  const home = path.join(root, ".tmp", "z1-native-1000000000000-abcdef");
  assert.deepEqual(u3DialogSelection(home, { canceled: true, filePaths: [] }), {
    canceled: true,
    filePaths: [],
  });
  const missing = path.join(home, "workspace", "missing.md");
  assert.deepEqual(u3DialogSelection(home, { canceled: false, filePaths: [missing] }), {
    canceled: false,
    filePaths: [missing],
  });
  assert.throws(
    () => u3DialogSelection(home, { canceled: false, filePaths: [path.join(root, "AGENTS.md")] }),
    /owned/,
  );
  assert.throws(() => u3DialogSelection(home, { canceled: true, filePaths: [missing] }), /cancel/i);
  assert.throws(() => u3DialogSelection(home, { canceled: false, filePaths: [] }), /one/);
});
