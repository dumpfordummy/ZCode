import type {
  GraphArtifact,
  GraphArtifactSource,
  GraphNodeAttempt,
  GraphSequentialRun,
  GraphResolvedBinding,
  GraphTaskNode,
} from "../contract.js";
import { parseGraphJson, parseBoundedGraphJson, selectGraphJsonPath } from "../domain/artifacts.js";
import { workspaceKey } from "../domain/definition.js";
import { runFingerprint } from "./attempts.js";
import { GraphState } from "./state.js";
import { currentTaskAttempt, currentToolAttempt } from "../domain/routing.js";

export class GraphArtifacts {
  constructor(private readonly state: GraphState) {}
  async read(run: GraphSequentialRun, artifactId: string) {
    const store = this.state.options.artifacts;
    const manifest = run.artifacts?.find((a) => a.id === artifactId);
    if (
      !store ||
      !manifest ||
      manifest.runId !== run.id ||
      manifest.workspaceKey !== workspaceKey(run.target)
    )
      throw new Error("Artifact does not belong to this run/workspace.");
    const captured = await store.read({
      target: run.target,
      runId: run.id,
      nodeId: manifest.nodeId,
      attemptId: manifest.attemptId,
      artifactId,
    });
    if (runFingerprint(captured.artifact) !== runFingerprint(manifest))
      throw new Error("Artifact manifest ownership or digest changed.");
    return captured;
  }
  add(run: GraphSequentialRun, artifact: GraphArtifact, selector: string): void {
    if (
      run.artifactBindings?.some(
        (b) =>
          b.nodeId === artifact.nodeId &&
          b.attemptId === artifact.attemptId &&
          b.selector === selector,
      )
    )
      throw new Error("Artifact selector is immutable for an exact node attempt.");
    (run.artifacts ??= []).push(artifact);
    (run.artifactBindings ??= []).push({
      nodeId: artifact.nodeId,
      attemptId: artifact.attemptId,
      selector,
      artifactId: artifact.id,
    });
  }
  async binding(
    run: GraphSequentialRun,
    source: GraphArtifactSource,
    alias: string,
    iterationId?: string,
  ): Promise<GraphResolvedBinding> {
    const task = iterationId
      ? run.nodeAttempts.find((a) => a.nodeId === source.nodeId && a.iterationId === iterationId)
      : currentTaskAttempt(run, source.nodeId);
    const tool = iterationId
      ? run.toolAttempts?.find((a) => a.nodeId === source.nodeId && a.iterationId === iterationId)
      : currentToolAttempt(run, source.nodeId);
    const attempt = task ?? tool;
    const observation =
      run.version === 5 &&
      source.selector === "verification" &&
      tool?.verification?.observationValid === true;
    if (
      !attempt ||
      (attempt.status !== "Completed" && !(observation && attempt.status === "Failed"))
    )
      throw new Error(`Artifact input ${alias} requires a completed, validated node.`);
    const ref = run.artifactBindings?.find(
      (b) =>
        b.nodeId === source.nodeId &&
        b.attemptId === attempt.attemptId &&
        b.selector === source.selector,
    );
    if (!ref)
      throw new Error(
        `Artifact input ${alias} has no declared captured selector ${source.selector}.`,
      );
    const { artifact, content } = await this.read(run, ref.artifactId);
    if (artifact.validation !== "valid")
      throw new Error(
        `Artifact input ${alias} is ${artifact.validation}: ${artifact.issue ?? "unusable"}`,
      );
    let text = content;
    if (source.pointer !== undefined && source.pointer !== "") {
      if (artifact.type !== "json")
        throw new Error("JSON field binding requires validated structured JSON output.");
      const value = selectGraphJsonPath(parseBoundedGraphJson(content), source.pointer);
      text = typeof value === "string" ? value : JSON.stringify(value);
    }
    return {
      alias,
      source,
      text,
      artifactId: artifact.id,
      sourceSessionId: artifact.sessionId,
      sourceInputId: artifact.inputId,
      sourceCommandId: artifact.commandId,
    };
  }
  async captureOutput(run: GraphSequentialRun, attempt: GraphNodeAttempt): Promise<void> {
    if (run.version < 4) return;
    const store = this.state.options.artifacts;
    const node = run.definition.nodes.find((n) => n.id === attempt.nodeId) as GraphTaskNode;
    const issues: string[] = [];
    if (!store) throw new Error("Graph artifact storage is unavailable.");
    const text = attempt.finalOutput?.text;
    if (text === undefined || attempt.outputIssue)
      issues.push(attempt.outputIssue ?? "The owned native input produced no final text.");
    const identity = {
      target: run.target,
      runId: run.id,
      nodeId: attempt.nodeId,
      attemptId: attempt.attemptId,
      sessionId: attempt.sessionId,
      inputId: attempt.inputId,
      commandId: attempt.commandId,
      capturedAt: this.state.options.now(),
    };
    const output = await store.put({
      ...identity,
      artifactId: this.state.options.id(),
      type: "text",
      provenance: "native-agent-final",
      content: text ?? "",
      validation: issues.length ? "invalid" : "valid",
      ...(issues.length ? { issue: issues.join("\n") } : {}),
    });
    this.add(run, output, "final");
    if (output.validation !== "valid") issues.push(output.issue ?? "Final artifact is incomplete.");
    if (node.output?.kind === "json" && !issues.length) {
      try {
        const parsed = parseGraphJson(text!, node.output.schema);
        if (parsed.evidenceReferences !== undefined) {
          if (
            !Array.isArray(parsed.evidenceReferences) ||
            parsed.evidenceReferences.some(
              (id) =>
                typeof id !== "string" ||
                !run.artifacts?.some(
                  (a) =>
                    a.id === id &&
                    (run.version !== 5 || attempt.bindings?.some((b) => b.artifactId === id)) &&
                    a.attemptId !== attempt.attemptId &&
                    a.validation === "valid" &&
                    a.runId === run.id &&
                    a.workspaceKey === workspaceKey(run.target),
                ),
            )
          )
            throw new Error(
              "Structured evidenceReferences must name validated artifacts from earlier completed attempts in this run.",
            );
          for (const id of parsed.evidenceReferences) await this.read(run, id as string);
        }
      } catch (error) {
        issues.push(error instanceof Error ? error.message : "Structured output is invalid.");
      }
      const structured = await store.put({
        ...identity,
        artifactId: this.state.options.id(),
        type: "json",
        provenance: "native-agent-final",
        content: text!,
        validation: issues.length ? "invalid" : "valid",
        ...(issues.length ? { issue: issues.join("\n") } : {}),
      });
      this.add(run, structured, "structured");
      if (structured.validation !== "valid")
        issues.push(structured.issue ?? "Structured artifact is incomplete.");
    }
    attempt.outputValidation = { status: issues.length ? "invalid" : "valid", issues };
    if (issues.length) {
      attempt.status = "Failed";
      attempt.outputIssue = issues.join("\n");
      attempt.message = `Native input completed; output validation failed. ${attempt.outputIssue}`;
    }
  }
  manifest(run: GraphSequentialRun): string {
    // 导出只包含身份、摘要和状态；原文、命令参数及可能含密钥的诊断不自动离开本地存储。
    return JSON.stringify(
      {
        version: 1,
        runId: run.id,
        status: run.status,
        artifacts: (run.artifacts ?? []).map((a) => ({
          id: a.id,
          nodeId: a.nodeId,
          attemptId: a.attemptId,
          type: a.type,
          provenance: a.provenance,
          digest: a.digest,
          bytes: a.bytes,
          capturedAt: a.capturedAt,
          validation: a.validation,
          redacted: a.redacted ?? false,
        })),
      },
      null,
      2,
    );
  }
}
