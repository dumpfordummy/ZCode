import type { GraphConditionNode, GraphJsonValue, GraphSequentialRun } from "../contract.js";
import { parseBoundedGraphJson, selectGraphJsonPath } from "../domain/artifacts.js";
import { currentIteration, currentToolAttempt, evaluateCondition } from "../domain/routing.js";
import { GraphArtifacts } from "./artifacts.js";
import { GraphRoutingChecks } from "./routing-checks.js";
import { appendIteration } from "./routing-plan.js";
import { GraphState } from "./state.js";

function object(value: GraphJsonValue): Record<string, GraphJsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected a structured object.");
  return value;
}

export class GraphRoutingDecision {
  private readonly checks: GraphRoutingChecks;
  constructor(
    private readonly state: GraphState,
    private readonly artifacts: GraphArtifacts,
  ) {
    this.checks = new GraphRoutingChecks(state);
  }
  async verifyCheckpoint(run: GraphSequentialRun): Promise<void> {
    const checkpoint = run.routing!.checkpoints.at(-1);
    if (!checkpoint || checkpoint.successorNodeId !== run.routing!.cursorNodeId) return;
    const decision = run.routing!.conditionAttempts.find(
      (a) => a.decisionId === checkpoint.decisionId,
    );
    const node = run.definition.nodes.find((n) => n.id === decision?.nodeId);
    if (!decision || node?.type !== "condition" || decision.status !== "Evaluated")
      throw new Error("Persisted Condition decision is unavailable.");
    const original = structuredClone(run);
    original.routing!.currentIterationId = decision.iterationId;
    const values: Record<string, GraphJsonValue> = Object.create(null);
    for (const binding of node.inputs) {
      if (binding.source.kind !== "artifact")
        throw new Error("Condition binding is not an artifact.");
      const resolved = await this.artifacts.binding(original, binding.source, binding.alias);
      const retained = await this.artifacts.read(original, resolved.artifactId!);
      const saved = decision.bindings?.find((b) => b.alias === binding.alias);
      const value = binding.source.pointer
        ? selectGraphJsonPath(parseBoundedGraphJson(retained.content), binding.source.pointer)
        : parseBoundedGraphJson(retained.content);
      if (
        !saved ||
        saved.artifactId !== retained.artifact.id ||
        saved.digest !== retained.artifact.digest ||
        this.checks.digest(saved.value) !== this.checks.digest(value)
      )
        throw new Error("Condition artifact identity or inspected bytes changed since routing.");
      values[binding.alias] = value;
    }
    const evaluated = evaluateCondition(node, values);
    if (
      evaluated.errors.length ||
      evaluated.selectedExit !== decision.selectedExit ||
      this.checks.digest(evaluated.values) !== this.checks.digest(decision.values)
    )
      throw new Error("Condition values no longer authorize the recorded exit.");
    await this.verification(original, node, decision.selectedExit!);
  }
  private async verification(
    run: GraphSequentialRun,
    node: GraphConditionNode,
    selectedExit: string,
  ) {
    const spec = node.verification;
    const observations: Array<{ artifactId: string; digest: string; value: GraphJsonValue }> = [];
    let findings: GraphJsonValue = [];
    let outcome: GraphJsonValue = "pass";
    if (!spec) return { observations, findings, outcome };
    for (const nodeId of spec.testNodeIds) {
      const tool = currentToolAttempt(run, nodeId);
      if (!tool?.verification?.observationValid || tool.recipe.verifier.kind !== "test")
        throw new Error("Required current Test evidence is missing, invalid or uncertain.");
      if (
        !node.inputs.some(
          (b) =>
            b.source.kind === "artifact" &&
            b.source.nodeId === nodeId &&
            b.source.selector === "verification" &&
            !b.source.pointer,
        )
      )
        throw new Error(
          "Required Test evidence must be explicitly bound in full to this Condition.",
        );
      const bound = await this.artifacts.binding(
        run,
        { kind: "artifact", nodeId, selector: "verification" },
        nodeId,
      );
      const retained = await this.artifacts.read(run, bound.artifactId!);
      observations.push({
        artifactId: retained.artifact.id,
        digest: retained.artifact.digest,
        value: parseBoundedGraphJson(retained.content),
      });
    }
    if (spec.reviewerNodeId) {
      const bound = await this.artifacts.binding(
        run,
        { kind: "artifact", nodeId: spec.reviewerNodeId, selector: "structured" },
        "reviewer",
      );
      const review = object(parseBoundedGraphJson(bound.text));
      outcome = review.outcome!;
      findings = review.findings!;
      const refs = review.evidenceReferences;
      if (
        typeof outcome !== "string" ||
        !["pass", "needs_changes", "needs_human"].includes(outcome) ||
        !Array.isArray(findings) ||
        findings.length > 32 ||
        findings.some((f) => {
          const value = object(f);
          return (
            typeof value.code !== "string" ||
            !value.code.trim() ||
            value.code.length > 200 ||
            typeof value.message !== "string" ||
            !value.message.trim() ||
            value.message.length > 2000
          );
        }) ||
        !Array.isArray(refs) ||
        refs.length !== observations.length ||
        new Set(refs).size !== refs.length ||
        observations.some((o) => !refs.includes(o.artifactId))
      )
        throw new Error(
          "Reviewer findings and evidenceReferences must name the exact bound current Test artifacts.",
        );
      if (outcome === "needs_human")
        throw new Error("The structured reviewer requires human intervention.");
    }
    const failed = observations.some((o) => object(o.value).outcome === "fail");
    if (
      // 未配置 Reviewer 时不能把默认值当作模型 PASS；真实失败仍禁止进入成功出口。
      (spec.reviewerNodeId && outcome === "pass" && failed) ||
      (selectedExit === spec.successExit && (failed || outcome !== "pass"))
    )
      throw new Error(
        "Reviewer PASS cannot override failed machine verification or authorize the success exit.",
      );
    const region = run.definition.routing!.region;
    if (
      region?.decisionNodeId === node.id &&
      selectedExit === region.repairExit &&
      !failed &&
      outcome !== "needs_changes"
    )
      throw new Error("Repair requires definitive failed assertions or structured needs_changes.");
    return { observations, findings, outcome };
  }
  async evaluate(run: GraphSequentialRun, node: GraphConditionNode): Promise<void> {
    const routing = run.routing!;
    const iteration = currentIteration(run)!;
    const attempt = routing.conditionAttempts.find(
      (a) => a.attemptId === iteration.attemptIds[node.id],
    )!;
    if (attempt.status !== "Pending")
      throw new Error("This exact Condition attempt was already evaluated.");
    try {
      const values: Record<string, GraphJsonValue> = Object.create(null);
      attempt.bindings = [];
      for (const binding of node.inputs) {
        if (binding.source.kind !== "artifact")
          throw new Error("Conditions require explicit structured artifact bindings.");
        const bound = await this.artifacts.binding(run, binding.source, binding.alias);
        const retained = await this.artifacts.read(run, bound.artifactId!);
        if (retained.artifact.type !== "json")
          throw new Error("Condition input must be validated JSON.");
        const value = binding.source.pointer
          ? selectGraphJsonPath(parseBoundedGraphJson(retained.content), binding.source.pointer)
          : parseBoundedGraphJson(retained.content);
        values[binding.alias] = value;
        attempt.bindings.push({
          alias: binding.alias,
          artifactId: retained.artifact.id,
          digest: retained.artifact.digest,
          value,
        });
      }
      const result = evaluateCondition(node, values);
      attempt.values = result.values;
      if (result.errors.length || !result.selectedExit)
        throw new Error(result.errors.join("\n") || "No declared exit selected.");
      const successor = run.definition.edges.find(
        (e) => e.source === node.id && e.sourcePort === result.selectedExit,
      )?.target;
      if (!successor) throw new Error("Condition exit has no permitted frozen successor.");
      const evidence = await this.verification(run, node, result.selectedExit);
      attempt.selectedExit = result.selectedExit;
      attempt.successorNodeId = successor;
      attempt.decisionId = this.state.options.id();
      attempt.status = "Evaluated";
      attempt.updatedAt = this.state.options.now();
      iteration.visitedNodeIds.push(node.id);
      const region = run.definition.routing!.region;
      if (region?.decisionNodeId === node.id && result.selectedExit === region.repairExit) {
        iteration.failureFingerprint = this.checks.digest({
          source: iteration.sourceDigest,
          findings: evidence.findings,
          tests: evidence.observations.map((o) => ({
            nodeId: object(o.value).nodeId,
            outcome: object(o.value).outcome,
            tests: object(o.value).tests,
          })),
        });
        if (
          region.stopOnNoProgress &&
          routing.iterations.some(
            (i) => i.id !== iteration.id && i.failureFingerprint === iteration.failureFingerprint,
          )
        ) {
          await this.checks.stop(
            run,
            "NoProgress",
            "Source and complete findings/test results repeat an earlier failed iteration.",
          );
          return;
        }
        if (iteration.index >= region.maxRepairIterations) {
          await this.checks.stop(
            run,
            "BudgetExhausted",
            "The frozen maximum repair iterations is exhausted.",
          );
          return;
        }
        const text = JSON.stringify({
          previousIterationId: iteration.id,
          previousIteration: iteration.index,
          sourceDigest: iteration.sourceDigest,
          findings: evidence.findings,
          observations: evidence.observations,
        });
        if (text.length > 100_000)
          throw new Error("Repair feedback exceeds the bounded envelope limit.");
        const next = appendIteration(run, this.state.options);
        next.sourceDigest = iteration.sourceDigest;
        next.feedback = {
          text,
          digest: this.checks.digest(text),
          artifactIds: evidence.observations.map((o) => o.artifactId),
          previousIterationId: iteration.id,
        };
      }
      routing.cursorNodeId = successor;
      // 未选分支保留 Skipped，合流仅等待实际选中的路由，不把跳过当成功。
      const reachable = new Set<string>();
      const queue = [successor];
      while (queue.length) {
        const id = queue.shift()!;
        if (reachable.has(id)) continue;
        reachable.add(id);
        queue.push(
          ...run.definition.edges
            .filter(
              (e) =>
                e.source === id &&
                !(
                  region &&
                  e.source === region.decisionNodeId &&
                  e.sourcePort === region.repairExit
                ),
            )
            .map((e) => e.target),
        );
      }
      for (const unused of [
        ...run.nodeAttempts,
        ...(run.toolAttempts ?? []),
        ...(run.approvalAttempts ?? []),
        ...routing.conditionAttempts,
      ]) {
        if (
          unused.iterationId === routing.currentIterationId &&
          unused.status === "Pending" &&
          !reachable.has(unused.nodeId)
        ) {
          unused.status = "Skipped";
          unused.updatedAt = this.state.options.now();
        }
      }
      const body = {
        id: this.state.options.id(),
        decisionId: attempt.decisionId,
        iterationId: routing.currentIterationId,
        successorNodeId: successor,
        sourceDigest: currentIteration(run)!.sourceDigest,
        createdAt: this.state.options.now(),
      };
      routing.checkpoints.push({ ...body, digest: this.checks.digest(body) });
      run.status = "Running";
    } catch (error) {
      attempt.status = "Invalid";
      // 反馈越界可能发生在选路后；只撤回当前无效 Condition 的访问记录，保留先前已证实的历史。
      const visitedIndex = iteration.visitedNodeIds.indexOf(attempt.nodeId);
      if (visitedIndex >= 0) iteration.visitedNodeIds.splice(visitedIndex, 1);
      delete attempt.selectedExit;
      delete attempt.decisionId;
      delete attempt.successorNodeId;
      attempt.message = error instanceof Error ? error.message : "Condition evidence is invalid.";
      attempt.updatedAt = this.state.options.now();
      await this.checks.stop(run, "NeedsHuman", attempt.message);
      return;
    }
    await this.state.put(run);
  }
}
