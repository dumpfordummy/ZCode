import type {
  GraphConditionAttempt,
  GraphConditionNode,
  GraphJsonValue,
  GraphSequentialRun,
} from "../contract.js";

/** Machine observations and structured review remain separate authorities on cold reads too. */
export function routeVerificationErrors(
  run: GraphSequentialRun,
  node: GraphConditionNode,
  attempt: GraphConditionAttempt,
): string[] {
  if (!node.verification || attempt.status !== "Evaluated") return [];
  const errors: string[] = [],
    spec = node.verification;
  const iteration = run.routing?.iterations.find((i) => i.id === attempt.iterationId);
  const tests = spec.testNodeIds.map((id) =>
    run.toolAttempts?.find((t) => t.nodeId === id && t.attemptId === iteration?.attemptIds[id]),
  );
  if (
    tests.some(
      (t) =>
        !t ||
        t.recipe.verifier.kind !== "test" ||
        !t.verification?.observationValid ||
        !t.verification.outcome,
    )
  )
    errors.push("Condition requires trustworthy exact current machine observations.");
  const ids = tests.map(
    (tool) =>
      run.artifactBindings?.find(
        (b) => b.attemptId === tool?.attemptId && b.selector === "verification",
      )?.artifactId,
  );
  if (ids.some((id) => !id)) errors.push("Condition machine artifact identity is missing.");
  let reviewOutcome: GraphJsonValue = "pass";
  if (spec.reviewerNodeId) {
    const input = node.inputs.find(
      (b) =>
        b.source.kind === "artifact" &&
        b.source.nodeId === spec.reviewerNodeId &&
        b.source.selector === "structured" &&
        !b.source.pointer,
    );
    const review = attempt.bindings?.find((b) => b.alias === input?.alias)?.value;
    if (!review || typeof review !== "object" || Array.isArray(review))
      errors.push("Condition reviewer object is unavailable.");
    else {
      reviewOutcome = review.outcome!;
      const refs = review.evidenceReferences;
      // 冷记录也保持原始类型；字符串转换会把单元素数组误认成有效的审核枚举。
      if (
        typeof reviewOutcome !== "string" ||
        !["pass", "needs_changes", "needs_human"].includes(reviewOutcome) ||
        !Array.isArray(refs) ||
        refs.length !== ids.length ||
        new Set(refs).size !== refs.length ||
        ids.some((id) => !refs.includes(id!))
      )
        errors.push("Condition reviewer references do not match exact current machine evidence.");
      if (
        !Array.isArray(review.findings) ||
        review.findings.length > 32 ||
        review.findings.some(
          (f) =>
            !f ||
            typeof f !== "object" ||
            Array.isArray(f) ||
            typeof f.code !== "string" ||
            !f.code.trim() ||
            f.code.length > 200 ||
            typeof f.message !== "string" ||
            !f.message.trim() ||
            f.message.length > 2000,
        )
      )
        errors.push("Condition reviewer findings are invalid.");
    }
  }
  const failed = tests.some((t) => t?.verification?.outcome === "fail");
  if (
    reviewOutcome === "needs_human" ||
    (spec.reviewerNodeId && reviewOutcome === "pass" && failed) ||
    (attempt.selectedExit === spec.successExit &&
      (reviewOutcome !== "pass" ||
        tests.some((t) => !t?.verification?.acceptancePassed || t.verification.outcome !== "pass")))
  )
    errors.push("Schema-valid reviewer PASS cannot bypass failed machine evidence.");
  const region = run.definition.routing?.region;
  if (
    region?.decisionNodeId === node.id &&
    attempt.selectedExit === region.repairExit &&
    !failed &&
    reviewOutcome !== "needs_changes"
  )
    errors.push(
      "Repair requires definitive test failure or a current semantic needs_changes decision.",
    );
  return errors;
}
