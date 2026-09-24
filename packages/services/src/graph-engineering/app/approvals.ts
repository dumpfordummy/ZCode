import type {
  GraphApprovalAttempt,
  GraphApprovalCommand,
  GraphApprovalEvidence,
  GraphApprovalNode,
  GraphApprovalRequest,
  GraphSequentialRun,
  IGraphEngineeringService,
} from "../contract.js";
import { isConfirmedTerminal, workspaceKey } from "../domain/definition.js";
import { nextStep, predecessorErrors, resumableGate } from "../domain/approvals.js";
import { runFingerprint, skipPending } from "./attempts.js";
import { GraphState } from "./state.js";
import { GraphArtifacts } from "./artifacts.js";
import { currentApprovalAttempt, currentTaskAttempt, currentIteration } from "../domain/routing.js";
import { frozenRoutingConfiguration } from "./routing-plan.js";

export class GraphApprovals {
  private readonly hostSessionId: string;
  constructor(private readonly state: GraphState) {
    this.hostSessionId = state.options.id();
  }
  private digest(value: unknown): string {
    const port = this.state.options.evidence;
    if (!port) throw new Error("Native approval evidence service is unavailable.");
    return port.digest(runFingerprint(value));
  }
  private graphDigest(run: GraphSequentialRun): string {
    if (run.version === 5) return this.digest(frozenRoutingConfiguration(run));
    return this.digest({
      definition: run.definition,
      defaults: run.defaults,
      settings: run.nodeAttempts.map((a) => a.settings),
      ...(run.version === 4
        ? {
            tools: run.toolAttempts?.map((a) => ({
              nodeId: a.nodeId,
              recipe: a.recipe,
              recipeDigest: a.recipeDigest,
            })),
          }
        : {}),
    });
  }
  private async evidence(
    run: GraphSequentialRun,
    node: GraphApprovalNode,
  ): Promise<GraphApprovalEvidence[]> {
    const result: GraphApprovalEvidence[] = [];
    let source:
      | Awaited<ReturnType<NonNullable<GraphState["options"]["evidence"]>["captureSource"]>>
      | undefined;
    for (const binding of node.evidence) {
      const entry: Omit<GraphApprovalEvidence, "digest"> = structuredClone(binding);
      if (binding.source.kind === "start") entry.text = run.startInput;
      else if (binding.source.kind === "artifact") {
        try {
          Object.assign(
            entry,
            await new GraphArtifacts(this.state).binding(run, binding.source, binding.alias),
          );
        } catch (error) {
          entry.issue =
            error instanceof Error ? error.message : "Artifact evidence is unavailable.";
        }
      } else if (binding.source.kind === "node") {
        const sourceId = binding.source.nodeId;
        const attempt = currentTaskAttempt(run, sourceId);
        if (
          attempt?.status !== "Completed" ||
          attempt.terminalProof?.state !== "completedSuccess" ||
          !attempt.finalOutput?.text.trim()
        )
          entry.issue = `Required output from ${sourceId} is missing or not proved successful.`;
        else
          Object.assign(entry, {
            text: attempt.finalOutput.text,
            sourceSessionId: attempt.sessionId,
            sourceInputId: attempt.inputId,
            sourceCommandId: attempt.commandId,
          });
      } else {
        try {
          source ??= await this.state.options.evidence!.captureSource(run.target);
          entry.snapshot = structuredClone(source);
          if (!source.complete)
            entry.issue = "Source evidence is incomplete; inspect every listed issue.";
        } catch (error) {
          entry.issue =
            error instanceof Error ? error.message : "Native source evidence is unavailable.";
        }
      }
      if (entry.text !== undefined && !entry.text.trim())
        entry.issue = "Required text evidence is empty.";
      result.push({ ...entry, digest: this.digest(entry) });
    }
    return result;
  }
  async prepare(run: GraphSequentialRun, nodeId: string): Promise<void> {
    const gate = currentApprovalAttempt(run, nodeId);
    const node = run.definition.nodes.find((n) => n.id === nodeId);
    if (!gate || node?.type !== "approval" || gate.status !== "Pending") return;
    const problems = predecessorErrors(run, nodeId);
    if (problems.length) throw new Error(problems.join("\n"));
    const evidence = await this.evidence(run, node);
    const issues = evidence.flatMap((e) => (e.issue ? [`${e.alias}: ${e.issue}`] : []));
    const body: Omit<GraphApprovalRequest, "digest"> = {
      id: this.state.options.id(),
      version: 1,
      runId: run.id,
      nodeId,
      attemptId: gate.attemptId,
      target: structuredClone(run.target),
      graphDigest: this.graphDigest(run),
      title: node.name,
      reviewText: node.reviewInstructions,
      commentPolicy: node.commentPolicy,
      successorNodeId:
        run.version === 5
          ? (run.definition.edges.find((e) => e.source === nodeId)?.target ?? null)
          : (run.plannedPath[run.plannedPath.indexOf(nodeId) + 1] ?? null),
      evidence,
      complete: issues.length === 0,
      issues,
      createdAt: this.state.options.now(),
    };
    gate.request = { ...body, digest: this.digest(body) };
    gate.status = "WaitingForApproval";
    gate.updatedAt = this.state.options.now();
    run.status = "WaitingForApproval";
    run.updatedAt = gate.updatedAt;
    run.message = issues.length
      ? issues.join("\n")
      : "Review the frozen evidence and explicitly approve or reject.";
    if (run.version === 5)
      for (const checkpoint of run.routing!.checkpoints)
        if (checkpoint.successorNodeId === nodeId && !checkpoint.consumedAt)
          checkpoint.consumedAt = this.state.options.now();
    await this.state.put(run);
  }
  private correlate(run: GraphSequentialRun, params: GraphApprovalCommand): GraphApprovalAttempt {
    const gate = run.approvalAttempts?.find(
      (g) => g.nodeId === params.nodeId && g.request?.id === params.requestId,
    );
    const request = gate?.request;
    if (
      !gate ||
      !request ||
      request.id !== params.requestId ||
      request.version !== params.requestVersion ||
      request.digest !== params.requestDigest
    )
      throw new Error("Approval request/version/digest conflict. Reload the original gate.");
    return gate;
  }
  private async check(run: GraphSequentialRun, gate: GraphApprovalAttempt): Promise<void> {
    const request = gate.request!;
    const record = await this.state.load(run.target);
    const { digest: storedDigest, ...body } = request;
    const node = run.definition.nodes.find((n) => n.id === gate.nodeId);
    const errors = predecessorErrors(run, gate.nodeId);
    if (
      record.runs.filter((r) => !isConfirmedTerminal(r)).length !== 1 ||
      workspaceKey(request.target) !== workspaceKey(run.target) ||
      request.runId !== run.id ||
      request.nodeId !== gate.nodeId ||
      request.attemptId !== gate.attemptId ||
      request.graphDigest !== this.graphDigest(run) ||
      storedDigest !== this.digest(body) ||
      runFingerprint(record.definition) !== runFingerprint(run.definition)
    )
      errors.push(
        "The graph, frozen settings or request identity changed since this evidence was captured.",
      );
    if (!request.complete)
      errors.push("Required evidence is incomplete. Cancel and start a new reviewed run.");
    if (node?.type !== "approval") errors.push("The frozen approval node is missing.");
    else {
      const current = await this.evidence(run, node);
      if (runFingerprint(current) !== runFingerprint(request.evidence))
        errors.push("Relevant evidence or source state changed after review.");
    }
    if (errors.length) {
      gate.status = "StaleEvidence";
      gate.resumeRequired = false;
      gate.message = errors.join("\n");
      gate.updatedAt = this.state.options.now();
      run.status = "StaleEvidence";
      run.message = gate.message;
      run.updatedAt = gate.updatedAt;
      await this.state.put(run);
      this.state.liveRuns.delete(run.id);
      throw new Error(gate.message);
    }
  }
  async decide(
    params: Parameters<IGraphEngineeringService["decideApproval"]>[0],
  ): Promise<{ run: GraphSequentialRun; dispatch: boolean }> {
    if (
      !params.decisionId?.trim() ||
      params.decisionId.length > 200 ||
      !["approve", "reject"].includes(params.value) ||
      typeof params.comment !== "string" ||
      params.comment.length > 2000
    )
      throw new Error(
        "A valid decision ID, Approve/Reject and comment of at most 2,000 characters are required.",
      );
    const value = await this.state.get(params.target, params.runId);
    if (value.version === undefined || value.version < 3)
      throw new Error("This run has no approval.");
    const record = await this.state.load(params.target);
    if (
      record.runs.some(
        (r) =>
          r.version !== undefined &&
          r.version >= 3 &&
          r.approvalAttempts?.some(
            (g) =>
              g.decision?.id === params.decisionId &&
              (r.id !== params.runId || g.nodeId !== params.nodeId),
          ),
      )
    )
      throw new Error("Approval decision ID conflict: this ID belongs to another request.");
    const run = structuredClone(value),
      gate = this.correlate(run, params);
    if (gate.decision) {
      const d = gate.decision;
      if (
        d.id === params.decisionId &&
        d.value === params.value &&
        d.comment === params.comment &&
        d.requestId === params.requestId &&
        d.requestVersion === params.requestVersion &&
        d.requestDigest === params.requestDigest
      )
        return { run, dispatch: false };
      throw new Error("Approval decision conflict: this request already has a committed decision.");
    }
    if (
      isConfirmedTerminal(run) ||
      run.cancelRequestedAt !== undefined ||
      gate.status !== "WaitingForApproval" ||
      gate.resumeRequired ||
      run.status !== "WaitingForApproval" ||
      !this.state.liveRuns.has(run.id) ||
      nextStep(run) !== gate.nodeId
    )
      throw new Error(
        "This gate cannot accept a decision. Continue explicitly after restart, or inspect its blocked state.",
      );
    if (gate.request!.commentPolicy === "required" && !params.comment.trim())
      throw new Error("A review comment is required.");
    await this.check(run, gate);
    gate.decision = {
      id: params.decisionId,
      requestId: params.requestId,
      requestVersion: params.requestVersion,
      requestDigest: params.requestDigest,
      value: params.value,
      comment: params.comment,
      decidedAt: this.state.options.now(),
      actor: { kind: "local-user", hostSessionId: this.hostSessionId },
    };
    gate.status = params.value === "approve" ? "Approved" : "Rejected";
    gate.updatedAt = this.state.options.now();
    if (params.value === "approve")
      gate.successorIntent = {
        id: this.state.options.id(),
        successorNodeId: gate.request!.successorNodeId,
      };
    else {
      run.status = "Rejected";
      run.message = "The human review was rejected; no successor will run.";
      skipPending(run, gate.updatedAt);
    }
    run.updatedAt = gate.updatedAt;
    await this.state.put(run);
    if (params.value === "reject") this.state.liveRuns.delete(run.id);
    return { run, dispatch: params.value === "approve" };
  }
  async continue(
    params: GraphApprovalCommand,
  ): Promise<{ run: GraphSequentialRun; dispatch: boolean }> {
    const value = await this.state.get(params.target, params.runId);
    if (value.version === undefined || value.version < 3)
      throw new Error("Only an undispatched approval gate can continue.");
    const run = structuredClone(value),
      gate = this.correlate(run, params);
    if (
      !gate.resumeRequired ||
      run.status !== "AwaitingContinuation" ||
      resumableGate(run)?.attemptId !== gate.attemptId
    )
      throw new Error(
        "Continue is blocked: work is active, uncertain, terminal, stale, or was already continued.",
      );
    await this.check(run, gate);
    gate.resumeRequired = false;
    gate.message = undefined;
    gate.updatedAt = this.state.options.now();
    run.status = gate.status === "Approved" ? "Running" : "WaitingForApproval";
    run.message =
      gate.status === "Approved"
        ? undefined
        : "Review the same frozen request and explicitly approve or reject.";
    run.updatedAt = gate.updatedAt;
    await this.state.put(run);
    this.state.liveRuns.add(run.id);
    return { run, dispatch: gate.status === "Approved" };
  }
  async beforeDispatch(run: GraphSequentialRun, nodeId: string | null): Promise<void> {
    const preceding =
      run.version === 5
        ? (currentIteration(run)?.visitedNodeIds ?? []).filter((id) => id !== nodeId)
        : run.plannedPath.slice(
            0,
            nodeId === null ? run.plannedPath.length : run.plannedPath.indexOf(nodeId),
          );
    const gates: GraphApprovalAttempt[] = [];
    // 连续人工关卡不能稀释前一个代码批准；只回溯到最近 Agent，其已授权修改不会被误判为陈旧。
    for (const id of preceding.reverse()) {
      if (
        run.nodeAttempts.some((a) => a.nodeId === id) ||
        run.toolAttempts?.some((a) => a.nodeId === id)
      )
        break;
      if (run.version === 5 && run.definition.nodes.find((n) => n.id === id)?.type === "condition")
        continue;
      const gate = currentApprovalAttempt(run, id);
      if (gate?.status !== "Approved")
        throw new Error("A preceding approval is incomplete or stale.");
      gates.push(gate);
    }
    for (const gate of gates) {
      if (gate.resumeRequired || !this.state.liveRuns.has(run.id))
        throw new Error("Approval requires explicit continuation.");
      await this.check(run, gate);
    }
  }
}
