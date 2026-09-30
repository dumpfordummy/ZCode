import { AlertTriangle } from "lucide-react";
import type { GraphRunResult } from "./graphRunResult.js";
import { useGraphRunText } from "./GraphRunText.js";

/**
 * A stopped or failed run states what was rejected, why (the persisted diagnostic), and what is
 * still true from captured facts. Actions live in GraphRunActions so each message appears once.
 */
export function GraphRunResultBlock({ result }: { result: GraphRunResult }) {
  const u = useGraphRunText();
  if (result.kind === "none") return null;
  const still = [
    ...(result.stillTrue.passedChecks.length
      ? [u("stillChecksPassed", { names: result.stillTrue.passedChecks.join(", ") })]
      : []),
    ...(result.stillTrue.capturedChangeFiles
      ? [u("stillChanges", { count: result.stillTrue.capturedChangeFiles })]
      : []),
    ...(result.stillTrue.approvalNotRequested ? [u("stillNoApproval")] : []),
    u("stillFilesRemain"),
  ];
  const reviewer = result.invalidOutputs[0];
  return (
    <div
      className="space-y-2 rounded-lg border border-warning/50 bg-warning/10 p-3 text-ui-sm"
      data-testid="graph-run-result-block"
      data-kind={result.kind}
    >
      {result.kind === "reviewer-output-invalid" && reviewer ? (
        // 保留既有 test id：数量与 data-state 由原生验收断言。
        <div data-testid="graph-run-structured-output" data-state="invalid" className="space-y-1">
          <p role="alert" data-testid="graph-run-output-validation-failed" className="flex gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            <span className="font-medium">
              {u("reviewerOutputRejected", { name: reviewer.name })}
              {result.stillTrue.approvalNotRequested ? ` ${u("noApprovalRequested")}` : ""}
            </span>
          </p>
          <p>{u("outputValidationFailed")}</p>
          {reviewer.issues.map((issue) => (
            <p
              key={issue}
              className="break-words font-mono text-ui-xs text-foreground-subtle"
              data-testid="graph-run-output-diagnostic"
            >
              {u("diagnostic")}: {issue}
            </p>
          ))}
        </div>
      ) : result.kind === "test-failed" ? (
        <p className="flex gap-2 font-medium">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <span>
            {u("testFailedHeadline", { names: result.failedChecks.map((c) => c.name).join(", ") })}
          </span>
        </p>
      ) : result.kind === "evidence-invalid" ? (
        <p className="flex gap-2 font-medium">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <span>
            {u("evidenceInvalidHeadline", {
              names: result.invalidChecks.map((c) => c.name).join(", "),
            })}
          </span>
        </p>
      ) : (
        <p className="flex gap-2 font-medium">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <span>{result.message || u("stoppedHeadline")}</span>
        </p>
      )}
      <div>
        <p className="text-ui-xs text-foreground-subtle">{u("stillTrue")}</p>
        <ul className="list-disc pl-5">
          {still.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
