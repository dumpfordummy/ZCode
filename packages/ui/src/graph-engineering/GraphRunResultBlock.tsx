import type { GraphRunResult } from "./graphRunResult.js";
import { useGraphRunText } from "./GraphRunText.js";

/**
 * A stopped or failed run states what was rejected, why (the persisted diagnostic), and what is
 * still true from captured facts. Actions live in GraphRunActions so each message appears once.
 * UX-M4: the content of the run banner (the banner supplies the icon, tone and surface).
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
  const headline = "text-ui-lg font-semibold";
  return (
    <div className="space-y-3" data-testid="graph-run-result-block" data-kind={result.kind}>
      {result.kind === "reviewer-output-invalid" && reviewer ? (
        // 保留既有 test id：数量与 data-state 由原生验收断言。
        <div data-testid="graph-run-structured-output" data-state="invalid" className="space-y-1">
          <p role="alert" data-testid="graph-run-output-validation-failed" className={headline}>
            {u("reviewerOutputRejected", { name: reviewer.name })}
            {result.stillTrue.approvalNotRequested ? ` ${u("noApprovalRequested")}` : ""}
          </p>
          <p>{u("outputValidationFailed")}</p>
          {reviewer.issues.map((issue) => (
            <p
              key={issue}
              className="break-words font-mono text-ui-sm text-foreground-subtle"
              data-testid="graph-run-output-diagnostic"
            >
              {u("diagnostic")}: {issue}
            </p>
          ))}
        </div>
      ) : result.kind === "test-failed" ? (
        <p className={headline}>
          {u("testFailedHeadline", { names: result.failedChecks.map((c) => c.name).join(", ") })}
        </p>
      ) : result.kind === "evidence-invalid" ? (
        <p className={headline}>
          {u("evidenceInvalidHeadline", {
            names: result.invalidChecks.map((c) => c.name).join(", "),
          })}
        </p>
      ) : (
        <p className={headline}>{result.message || u("stoppedHeadline")}</p>
      )}
      <div>
        <p className="text-ui-sm font-medium text-foreground-subtle">{u("stillTrue")}</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {still.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
