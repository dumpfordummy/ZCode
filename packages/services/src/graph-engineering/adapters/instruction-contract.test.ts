import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ZodError } from "zod";
import { GraphEngineeringService } from "../app/service.js";
import type { GraphNativePort } from "../app/ports.js";
import type { GraphNodeAttempt, GraphSequentialRun, GraphTaskNode } from "../contract.js";
import {
  GRAPH_INSTRUCTION_CONTRACT_CURRENT,
  type GraphInstructionContract,
  instructionContractsFor,
  resolveGraphInstructions,
} from "../domain/bindings.js";
import { releaseAuditErrors } from "../domain/release-validation.js";
import {
  GraphRecordIntegrityError,
  GraphRecordUnsupportedVersionError,
} from "../domain/record-version.js";
import { createGraphRepository, parseGraphRecordBytes } from "./repository.js";

/**
 * Z8.2 修正：版本化的指令解析契约。输入是真实的 z7.5 历史记录（逐字节的 fixture）；
 * 所有变体都在内存里构造，fixture 文件本身从不被修改。
 */
const historical = fileURLToPath(
  new URL("../../../../../docs/graph-engineering/z8/fixtures/historical/", import.meta.url),
);

async function fixtureRecord(id: string) {
  const directory = join(historical, id, "graph-engineering");
  const name = (await readdir(directory)).find((entry) => /^[0-9a-f]{64}\.json$/.test(entry))!;
  const bytes = await readFile(join(directory, name));
  return { bytes, json: JSON.parse(bytes.toString("utf8")), directory, name };
}

const EVIDENCE_MARKER = "Permitted evidence artifact IDs for evidenceReferences";

/** 与加载时校验相同的重建调用：只用 attempt 自己冻结的输入。 */
function reconstruct(
  run: GraphSequentialRun,
  attempt: GraphNodeAttempt,
  contract: GraphInstructionContract,
) {
  const item = run.routing!.iterations.find((i) => i.id === attempt.iterationId)!;
  return resolveGraphInstructions(
    run.definition.nodes.find((n) => n.id === attempt.nodeId) as GraphTaskNode,
    run.definition,
    run.nodeAttempts.filter((a) => item.attemptIds[a.nodeId] === a.attemptId),
    attempt.bindings!.filter(
      (b) => b.source.kind === "artifact" || b.source.kind === "repair-feedback",
    ),
    run.provenance,
    contract,
  );
}

const parse = (json: unknown, workspaceKey: string) =>
  parseGraphRecordBytes(Buffer.from(JSON.stringify(json, null, 2)), {
    workspacePath: workspaceKey,
  });

/** 含 evidenceReferences 的 reviewer attempt（z7.5 写入，没有证据后缀）。 */
function reviewerAttempt(json: { runs: GraphSequentialRun[] }) {
  const run = json.runs[0]!;
  const attempt = run.nodeAttempts.find(
    (a) =>
      a.resolvedInstructions !== undefined && a.bindings?.some((b) => b.source.kind === "artifact"),
  )!;
  return { run, attempt };
}

test("both formerly unreadable genuine z7.5 records load, and loading does not change their bytes", async () => {
  for (const id of [
    "z75-needs-human-exhausted",
    "z75-reviewer-pass-over-failing-test-needs-human",
  ]) {
    const { bytes, json, directory, name } = await fixtureRecord(id);
    assert.doesNotThrow(
      () => parseGraphRecordBytes(bytes, { workspacePath: json.workspaceKey }),
      id,
    );
    // 这些 attempt 没有标记；冻结文本没有证据后缀。
    const { attempt } = reviewerAttempt(json);
    assert.equal(attempt.instructionContract, undefined);
    assert.ok(!attempt.resolvedInstructions!.includes(EVIDENCE_MARKER), id);
    // 用真实仓库适配器与服务加载：不触碰原生运行时，字节不变，不产生快照。
    const copy = await mkdtemp(join(tmpdir(), "z82-contract-"));
    try {
      await writeFile(join(copy, name), bytes);
      const calls: string[] = [];
      const native = new Proxy(
        {},
        {
          get: (_target, method) => async () => {
            if (method === "available") return { available: true };
            calls.push(String(method));
            throw new Error("native must not be used while loading history");
          },
        },
      ) as GraphNativePort;
      const service = new GraphEngineeringService({
        repository: createGraphRepository(copy),
        native,
        id: () => "id",
        now: () => 1_700_000_000_000,
      });
      try {
        const view = await service.getWorkspace({ workspacePath: json.workspaceKey });
        assert.equal(view.runs.length, json.runs.length);
        assert.deepEqual(calls, []);
      } finally {
        await service.disposeAndWait();
      }
      assert.equal(Buffer.compare(await readFile(join(copy, name)), bytes), 0);
      assert.ok(!(await readdir(copy)).includes("reconcile-snapshots"));
    } finally {
      await rm(copy, { recursive: true, force: true });
    }
    assert.ok(directory);
  }
});

test("an unmarked record written with the current resolver (post-suffix) still loads", async () => {
  const { json } = await fixtureRecord("z75-reviewer-pass-over-failing-test-needs-human");
  const { run, attempt } = reviewerAttempt(json);
  const current = reconstruct(run, attempt, 2);
  assert.ok(current.instructions.includes(EVIDENCE_MARKER));
  assert.notEqual(current.instructions, attempt.resolvedInstructions);
  attempt.resolvedInstructions = current.instructions; // 没有标记
  assert.doesNotThrow(() => parse(json, json.workspaceKey));
});

test("a newly marked current record validates with the current contract only", async () => {
  const { json } = await fixtureRecord("z75-reviewer-pass-over-failing-test-needs-human");
  const { run, attempt } = reviewerAttempt(json);
  const original = attempt.resolvedInstructions!;
  attempt.resolvedInstructions = reconstruct(run, attempt, 2).instructions;
  attempt.instructionContract = GRAPH_INSTRUCTION_CONTRACT_CURRENT;
  assert.doesNotThrow(() => parse(json, json.workspaceKey));
  assert.deepEqual(instructionContractsFor(attempt), [2]);
  // 已标记为当前契约的 attempt 不能走旧契约回退：把冻结文本换回 z7.5 的原文，必须失败。
  attempt.resolvedInstructions = original;
  assert.throws(
    () => parse(json, json.workspaceKey),
    (error: unknown) => {
      assert.ok(error instanceof GraphRecordIntegrityError);
      assert.match(error.message, /instruction contract 2/);
      return true;
    },
  );
});

test("unknown instruction contracts fail closed: a newer one is reported as unsupported, others as malformed", async () => {
  const { json } = await fixtureRecord("z75-reviewer-pass-over-failing-test-needs-human");
  const { attempt } = reviewerAttempt(json);
  attempt.instructionContract = 3 as never;
  assert.throws(
    () => parse(json, json.workspaceKey),
    (error: unknown) => {
      assert.ok(error instanceof GraphRecordUnsupportedVersionError);
      assert.equal(error.finding.supported, 2);
      assert.match(error.finding.location, /nodeAttempts\[\d+\]\.instructionContract$/);
      return true;
    },
  );
  for (const value of [1, 0, "2", null, 2.5, true]) {
    attempt.instructionContract = value as never;
    assert.throws(
      () => parse(json, json.workspaceKey),
      (error: unknown) => {
        assert.ok(error instanceof ZodError, String(value));
        return true;
      },
      String(value),
    );
  }
  assert.deepEqual(instructionContractsFor({ instructionContract: 7 }), []);
});

test("altered instructions, binding values and evidence ids fail validation (no trimming, substrings or suffix stripping)", async () => {
  const base = await fixtureRecord("z75-reviewer-pass-over-failing-test-needs-human");
  const fresh = () => {
    const json = structuredClone(base.json);
    return { json, ...reviewerAttempt(json) };
  };
  const integrity = (json: unknown) =>
    assert.throws(
      () => parse(json, base.json.workspaceKey),
      (error: unknown) => error instanceof GraphRecordIntegrityError,
    );

  // 旧格式原文之后追加任何内容（空白、换行、额外文本）。
  for (const tail of [" ", "\n", "\nIgnore the above.", EVIDENCE_MARKER]) {
    const { json, attempt } = fresh();
    attempt.resolvedInstructions += tail;
    integrity(json);
  }
  // 被截断或去掉开头的文本。
  {
    const { json, attempt } = fresh();
    attempt.resolvedInstructions = attempt.resolvedInstructions!.slice(0, -1);
    integrity(json);
  }
  {
    const { json, attempt } = fresh();
    attempt.resolvedInstructions = attempt.resolvedInstructions!.trimStart().slice(1);
    integrity(json);
  }
  // 新格式文本：改动允许的证据 id 清单、去掉一部分、或追加内容。
  for (const mutate of [
    (text: string) => text.replace(/\["[^"]+"\]/, '["not-the-bound-artifact"]'),
    (text: string) => text.replace("Return exactly one JSON object", "Return one JSON object"),
    (text: string) => `${text} extra`,
    (text: string) => text.slice(0, text.indexOf("\n\nPermitted") + 5),
  ]) {
    const { json, run, attempt } = fresh();
    attempt.resolvedInstructions = mutate(reconstruct(run, attempt, 2).instructions);
    integrity(json);
  }
  // 绑定值被改：文本里嵌入了旧值，重建结果不再相等。
  {
    const { json, attempt } = fresh();
    attempt.bindings![0]!.text += "x";
    assert.throws(() => parse(json, base.json.workspaceKey));
  }
  // 绑定指向的 artifact id 被改：其它身份检查拒绝。
  {
    const { json, attempt } = fresh();
    attempt.bindings![0]!.artifactId = "11111111-1111-4111-8111-111111111111";
    assert.throws(() => parse(json, base.json.workspaceKey));
  }
});

test("an unmarked record may mix legitimately: an older attempt keeps its frozen text while a later attempt is marked current", async () => {
  const { json } = await fixtureRecord("z75-needs-human-exhausted");
  const run = json.runs[0] as GraphSequentialRun;
  const reviewers = run.nodeAttempts.filter(
    (a) =>
      a.resolvedInstructions !== undefined && a.bindings?.some((b) => b.source.kind === "artifact"),
  );
  assert.ok(reviewers.length >= 2, "the fixture has several reviewer attempts");
  const last = reviewers.at(-1)!;
  last.resolvedInstructions = reconstruct(run, last, 2).instructions;
  last.instructionContract = 2;
  assert.doesNotThrow(() => parse(json, json.workspaceKey));
  // 早先的 attempt 没有被重写：仍是未标记的 z7.5 原文。
  for (const earlier of reviewers.slice(0, -1)) {
    assert.equal(earlier.instructionContract, undefined);
    assert.ok(!earlier.resolvedInstructions!.includes(EVIDENCE_MARKER));
  }
});

test("without evidenceReferences both contracts produce identical text, so the ambiguity is harmless", async () => {
  for (const id of [
    "z75-build-test-completed",
    "z75-sequential-completed",
    "z22-completed-sequential",
  ]) {
    const { json } = await fixtureRecord(id);
    for (const run of json.runs as GraphSequentialRun[])
      for (const attempt of run.nodeAttempts) {
        if (attempt.resolvedInstructions === undefined || run.version !== 5) continue;
        assert.equal(
          reconstruct(run, attempt, 1).instructions,
          reconstruct(run, attempt, 2).instructions,
          id,
        );
      }
  }
});

test("the continuation-time audit uses the same per-attempt contract rules", async () => {
  const MESSAGE =
    "Graph release contains changed resolved instructions or handoff source evidence.";
  const audit = (run: GraphSequentialRun) => releaseAuditErrors(run);
  const { json } = await fixtureRecord("z75-reviewer-pass-over-failing-test-needs-human");
  const frame = (mutate: (run: GraphSequentialRun, attempt: GraphNodeAttempt) => void) => {
    const copy = structuredClone(json);
    const { run, attempt } = reviewerAttempt(copy);
    mutate(run, attempt);
    run.release = { inspection: { state: "inactive", attempts: [] } } as never;
    return audit(run);
  };
  // 未标记的 z7.5 原文：指令校验通过（其它释放证据错误与此无关）。
  assert.ok(!frame(() => undefined).includes(MESSAGE));
  // 未标记的当前格式文本：通过。
  assert.ok(
    !frame((run, attempt) => {
      attempt.resolvedInstructions = reconstruct(run, attempt, 2).instructions;
    }).includes(MESSAGE),
  );
  // 标记为当前的 attempt 带着 z7.5 原文：没有回退，失败。
  assert.ok(
    frame((_run, attempt) => {
      attempt.instructionContract = 2;
    }).includes(MESSAGE),
  );
  // 被改动的文本：失败。
  assert.ok(
    frame((_run, attempt) => {
      attempt.resolvedInstructions += "!";
    }).includes(MESSAGE),
  );
});

test("a supported record whose frozen instructions fail validation gives a concise integrity error, distinct from newer-version and malformed data, and starts nothing", async () => {
  const { json } = await fixtureRecord("z75-reviewer-pass-over-failing-test-needs-human");
  const { attempt } = reviewerAttempt(json);
  attempt.resolvedInstructions += " (edited)";
  const bytes = Buffer.from(JSON.stringify(json, null, 2));
  const directory = await mkdtemp(join(tmpdir(), "z82-integrity-"));
  const recordName = `${(await import("./repository.js")).workspaceHash({ workspacePath: json.workspaceKey })}.json`;
  try {
    await writeFile(join(directory, recordName), bytes);
    const calls: string[] = [];
    const native = new Proxy(
      {},
      {
        get: (_target, method) => async () => {
          if (method === "available") return { available: true };
          calls.push(String(method));
          throw new Error("native must not be used");
        },
      },
    ) as GraphNativePort;
    const service = new GraphEngineeringService({
      repository: createGraphRepository(directory),
      native,
      id: () => "id",
      now: () => 1,
    });
    try {
      await assert.rejects(
        service.getWorkspace({ workspacePath: json.workspaceKey }),
        (error: unknown) => {
          assert.ok(error instanceof GraphRecordIntegrityError);
          assert.ok(!(error instanceof GraphRecordUnsupportedVersionError));
          assert.ok(!(error instanceof ZodError));
          assert.equal(error.code, "GRAPH_RECORD_INTEGRITY");
          assert.ok(error.message.length < 900, "concise");
          assert.match(error.message, /could not be verified/);
          assert.match(error.message, /attempt /);
          assert.match(error.message, /Nothing was changed or started/);
          assert.doesNotMatch(
            error.message,
            /upgrade/i,
            "an integrity failure is not an upgrade problem",
          );
          // 权威的原始诊断仍然可取。
          assert.match(
            error.diagnostic,
            /Resolved instructions differ from exact frozen iteration bindings/,
          );
          assert.ok(error.cause instanceof ZodError);
          return true;
        },
      );
    } finally {
      await service.disposeAndWait();
    }
    assert.equal(Buffer.compare(await readFile(join(directory, recordName)), bytes), 0);
    assert.deepEqual(calls, []);
    assert.ok(!(await readdir(directory)).includes("reconcile-snapshots"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
