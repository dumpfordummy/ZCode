import assert from "node:assert/strict";
import test from "node:test";
import type { GraphSequentialRun, GraphTaskNode, GraphNodeAttempt, GraphResolvedBinding } from "../contract.js";
import { parseGraphJson } from "../domain/artifacts.js";
import { reviewer } from "../domain/workflow-sample-nodes.js";
import { resolveGraphInstructions } from "../domain/bindings.js";
import { GraphArtifacts } from "./artifacts.js";
import { routingFixture } from "./routing.fixture.js";
import { GraphState } from "./state.js";
import { target } from "./sequential.fixture.js";

// 复现用户观察到的 Sequential Engineering reviewer 失败：通过真实 parseGraphJson 与
// GraphArtifacts.captureOutput 路径，分别验证 prose/fence 拒绝、未绑定 report ID 拒绝、
// 以及仅引用已绑定 verification 时的结构化接受。
const reviewerNode = reviewer() as GraphTaskNode;
const schema = reviewerNode.output!.schema!;

function verificationValue(reportArtifactId: string) {
  return {
    nodeId: "test",
    outcome: "pass",
    testCount: 1,
    passed: 1,
    failed: 0,
    skipped: 0,
    reportArtifactId,
  };
}

async function buildRun(
  options: ReturnType<typeof routingFixture>["options"],
  finalText: string,
) {
  const verificationArtifactId = "verification-artifact";
  const reportArtifactId = "report-artifact";
  const verificationContent = JSON.stringify(verificationValue(reportArtifactId));
  const verificationArtifact = await options.artifacts!.put({
    target,
    runId: "run",
    nodeId: "test",
    attemptId: "test-attempt",
    artifactId: verificationArtifactId,
    type: "json",
    provenance: "native-test",
    content: verificationContent,
    capturedAt: 1,
    validation: "valid",
  });
  const reportArtifact = await options.artifacts!.put({
    target,
    runId: "run",
    nodeId: "test",
    attemptId: "test-attempt",
    artifactId: reportArtifactId,
    type: "json",
    provenance: "native-test",
    content: JSON.stringify({ summary: "test report" }),
    capturedAt: 1,
    validation: "valid",
  });
  const attempt: GraphNodeAttempt = {
    nodeId: "reviewer",
    attemptId: "reviewer-attempt",
    status: "Completed",
    iterationId: "iteration",
    sessionId: "session-reviewer",
    inputId: "input-reviewer",
    commandId: "command-reviewer",
    finalOutput: { text: finalText, rowId: 1, turnId: "turn-reviewer" },
    // 实际运行时由 sequencer 从节点 inputs 解析；reviewer() 只绑定 verification。
    bindings: [{ alias: "verification", artifactId: verificationArtifactId }],
  } as unknown as GraphNodeAttempt;
  return {
    attempt,
    run: {
      id: "run",
      version: 5,
      target,
      status: "Running",
      definition: {
        version: 5,
        revision: 0,
        name: "Sequential engineering",
        nodes: [
          { id: "start", type: "start" },
          { id: "test", type: "tool" },
          reviewerNode,
          { id: "final-gate", type: "approval" },
          { id: "end", type: "end", outputNodeId: "test" },
        ],
        edges: [
          { source: "start", target: "test" },
          { source: "test", target: "reviewer" },
          { source: "reviewer", target: "final-gate" },
        ],
        routing: { finalGateId: "final-gate", limits: { maxNodeAdmissions: 24, deadlineMs: 1800000 } },
      },
      nodeAttempts: [attempt],
      toolAttempts: [
        {
          nodeId: "test",
          attemptId: "test-attempt",
          status: "Completed",
          recipe: { verifier: { kind: "test" } },
          verification: { observationValid: true, outcome: "pass" },
          iterationId: "iteration",
        },
      ],
      approvalAttempts: [],
      artifacts: [verificationArtifact, reportArtifact],
      artifactBindings: [
        {
          nodeId: "test",
          attemptId: "test-attempt",
          selector: "verification",
          artifactId: verificationArtifactId,
        },
        {
          nodeId: "test",
          attemptId: "test-attempt",
          selector: "normalized-report",
          artifactId: reportArtifactId,
        },
      ],
    } as unknown as GraphSequentialRun,
    verificationArtifactId,
    reportArtifactId,
  };
}

test("reproduction: strict parseGraphJson rejects prose and Markdown-fenced JSON", () => {
  const valid = JSON.stringify({
    outcome: "pass",
    findings: [],
    evidenceReferences: ["verification-artifact"],
  });
  // 纯 JSON 对象被接受。
  assert.ok(parseGraphJson(valid, schema));
  // 前置 prose 被拒绝。
  assert.throws(() => parseGraphJson(`Here is my review.\n${valid}`, schema), /Strict JSON|Invalid/);
  // Markdown 围栏被拒绝。
  assert.throws(() => parseGraphJson("```json\n" + valid + "\n```", schema), /Strict JSON|Invalid/);
  // 后置 prose 被拒绝（trailing data）。
  assert.throws(() => parseGraphJson(`${valid}\nDone.`, schema), /trailing data|Strict JSON/);
});

test("reproduction: captureOutput accepts valid JSON referencing only the bound verification artifact", async () => {
  const fixture = routingFixture();
  try {
    const valid = JSON.stringify({
      outcome: "pass",
      findings: [],
      evidenceReferences: ["verification-artifact"],
    });
    const { run, attempt } = await buildRun(fixture.options, valid);
    const state = new GraphState(fixture.options);
    const artifacts = new GraphArtifacts(state);
    await artifacts.captureOutput(run, attempt);
    assert.equal(attempt.outputValidation?.status, "valid");
    assert.notEqual(attempt.status, "Failed");
  } finally {
    await fixture.service.disposeAndWait();
  }
});

test("reproduction: captureOutput rejects JSON that also references the embedded, unbound report artifact", async () => {
  const fixture = routingFixture();
  try {
    const valid = JSON.stringify({
      outcome: "needs_changes",
      findings: [{ code: "git-untracked", message: "zz-demo.txt is not tracked by Git." }],
      evidenceReferences: ["verification-artifact", "report-artifact"],
    });
    const { run, attempt } = await buildRun(fixture.options, valid);
    const state = new GraphState(fixture.options);
    const artifacts = new GraphArtifacts(state);
    await artifacts.captureOutput(run, attempt);
    assert.equal(attempt.outputValidation?.status, "invalid");
    assert.equal(attempt.status, "Failed");
    assert.match(
      attempt.outputIssue ?? "",
      /Structured evidenceReferences must name validated artifacts from earlier completed attempts/,
    );
  } finally {
    await fixture.service.disposeAndWait();
  }
});

test("reproduction: captureOutput rejects prose-wrapped fenced JSON as the final output", async () => {
  const fixture = routingFixture();
  try {
    const valid = JSON.stringify({
      outcome: "needs_changes",
      findings: [{ code: "git-untracked", message: "zz-demo.txt is not tracked by Git." }],
      evidenceReferences: ["verification-artifact"],
    });
    const prose = `I reviewed the verification.\n\`\`\`json\n${valid}\n\`\`\``;
    const { run, attempt } = await buildRun(fixture.options, prose);
    const state = new GraphState(fixture.options);
    const artifacts = new GraphArtifacts(state);
    await artifacts.captureOutput(run, attempt);
    assert.equal(attempt.outputValidation?.status, "invalid");
    assert.equal(attempt.status, "Failed");
  } finally {
    await fixture.service.disposeAndWait();
  }
});

// 复用 buildRun 的合成 run，捕获指定 finalText 后返回 attempt，便于多个结构化用例共享装配。
async function captureReview(
  fixture: ReturnType<typeof routingFixture>,
  finalText: string,
) {
  const { run, attempt, verificationArtifactId } = await buildRun(
    fixture.options,
    finalText,
  );
  const state = new GraphState(fixture.options);
  const artifacts = new GraphArtifacts(state);
  await artifacts.captureOutput(run, attempt);
  return { attempt, verificationArtifactId };
}

const validEnvelope = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    outcome: "pass",
    findings: [],
    evidenceReferences: ["verification-artifact"],
    ...overrides,
  });

test("regression: duplicate keys, multiple objects and malformed JSON are rejected with strict diagnostics", () => {
  const valid = validEnvelope();
  // 重复键被拒绝。
  assert.throws(
    () =>
      parseGraphJson(
        `{"outcome":"pass","outcome":"needs_changes","findings":[],"evidenceReferences":["verification-artifact"]}`,
        schema,
      ),
    /Duplicate JSON key: outcome/,
  );
  // 多个对象（尾随数据）被拒绝。
  assert.throws(() => parseGraphJson(`${valid}${valid}`, schema), /trailing data/);
  // 截断/畸形 JSON 被拒绝。
  assert.throws(
    () => parseGraphJson(`{"outcome":"pass","findings":[],"evidenceReferences":[`, schema),
    /Invalid strict JSON|Invalid JSON/,
  );
});

test("regression: oversized evidenceReference and findings exceed schema bounds and are rejected", () => {
  const longRef = "x".repeat(201);
  assert.throws(
    () => parseGraphJson(validEnvelope({ evidenceReferences: [longRef] }), schema),
    /does not match schema/,
  );
  const longMessage = "y".repeat(1001);
  assert.throws(
    () =>
      parseGraphJson(
        validEnvelope({ findings: [{ code: "scope", message: longMessage }] }),
        schema,
      ),
    /does not match schema/,
  );
});

test("regression: valid needs_changes over a passing Test is accepted as a distinct in-scope finding", async () => {
  const fixture = routingFixture();
  try {
    const text = validEnvelope({
      outcome: "needs_changes",
      findings: [{ code: "scope", message: "Change touches an unrelated module." }],
    });
    const { attempt } = await captureReview(fixture, text);
    // 通过的 Test 不禁止有据的 in-scope 评审意见：结构化输出被接受，与解析/机器失败区分。
    assert.equal(attempt.outputValidation?.status, "valid");
    assert.notEqual(attempt.status, "Failed");
  } finally {
    await fixture.service.disposeAndWait();
  }
});

test("regression: valid needs_human is accepted and distinct from parser or machine failure", async () => {
  const fixture = routingFixture();
  try {
    const text = validEnvelope({
      outcome: "needs_human",
      findings: [{ code: "missing-context", message: "Required source snapshot is unavailable." }],
    });
    const { attempt } = await captureReview(fixture, text);
    // needs_human 是显式不确定性，结构化接受；与解析失败、机器失败区分（路由层另作处理）。
    assert.equal(attempt.outputValidation?.status, "valid");
    assert.notEqual(attempt.status, "Failed");
  } finally {
    await fixture.service.disposeAndWait();
  }
});

test("regression: resolved reviewer prompt lists only the bound verification ID and forbids invented Git-tracking", () => {
  const graph = {
    version: 5,
    revision: 0,
    name: "Sequential engineering",
    nodes: [
      { id: "start", type: "start", position: { x: 0, y: 0 }, request: "Modify zz-demo.txt to contain 'after'." },
      reviewerNode,
      { id: "end", type: "end", position: { x: 0, y: 0 }, outputNodeId: "test" },
    ],
    edges: [],
  } as unknown as Parameters<typeof resolveGraphInstructions>[1];
  // verification 内容内嵌 reportArtifactId，但 reviewer 只绑定 verification；契约段只能列出后者。
  const verificationContent = JSON.stringify({
    nodeId: "test",
    outcome: "pass",
    testCount: 1,
    passed: 1,
    failed: 0,
    skipped: 0,
    reportArtifactId: "embedded-report-id",
  });
  const artifacts: GraphResolvedBinding[] = [
    {
      alias: "verification",
      source: { kind: "artifact", nodeId: "test", selector: "verification" },
      text: verificationContent,
      artifactId: "verification-artifact",
    },
  ];
  const resolved = resolveGraphInstructions(reviewerNode, graph, [], artifacts);
  // 允许清单这一行恰好只列 verification artifact ID；内嵌的 report ID 出现在 verification
  // 内容中（评审需要看到机器结果），但不进入允许清单。
  const permittedLine = resolved.instructions.match(
    /Permitted evidence artifact IDs for evidenceReferences: [^\n]*/,
  )?.[0];
  assert.equal(
    permittedLine,
    'Permitted evidence artifact IDs for evidenceReferences: ["verification-artifact"]',
  );
  // 显式禁止发明 Git 跟踪前置条件，且要求单一 JSON 对象、无 prose/围栏。
  assert.match(resolved.instructions, /do not require Git-tracked or committed source/);
  assert.match(resolved.instructions, /no prose before or after, no Markdown fence/);
});
