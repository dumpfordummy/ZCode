import type { GraphTrxParseInput, GraphTrxReport } from "../dotnet-types.js";
import { parseTrxXml, type TrxXmlElement } from "./trx-xml.js";
import { trxAttribute, trxChild, trxChildren, trxFail, validateTrxShape } from "./trx-shape.js";
import { trxAssemblyComparator, trxDuration, trxGuid, trxTime, trxWindow } from "./trx-values.js";

import { validateTrxRunInfos } from "./trx-runinfo.js";

const NAMESPACE = "http://microsoft.com/schemas/VisualStudio/TeamTest/2010";
const UNIT_TEST = "13cdc9d9-ddb5-4fa4-a97d-d965ccfc6d4b";
const get = (node: TrxXmlElement, key: string) => trxAttribute(node, key);
const guid = (node: TrxXmlElement, key: string) => trxGuid(get(node, key));
const children = (node: TrxXmlElement, container: string, kind: string) => {
  const child = trxChild(node, container, false);
  return child ? trxChildren(child, kind) : [];
};

function reportTimes(root: TrxXmlElement, input: GraphTrxParseInput) {
  if (
    !Number.isSafeInteger(input.startedAt) ||
    !Number.isSafeInteger(input.completedAt) ||
    input.startedAt < 0 ||
    input.completedAt < input.startedAt
  )
    trxFail("invalid native command window.");
  const times = trxChild(root, "Times")!;
  const startedAt = trxTime(get(times, "start"));
  const finishedAt = trxTime(get(times, "finish"));
  if (finishedAt < startedAt) trxFail("report time order is invalid.");
  for (const key of ["creation", "queuing", "start", "finish"])
    trxWindow(trxTime(get(times, key)), input.startedAt, input.completedAt);
  // 真实 VSTest 在开始执行后才创建 TRX；creation/queuing 不要求早于 start。
  for (const key of ["creation", "queuing"])
    if (trxTime(get(times, key)) > finishedAt)
      trxFail("report creation/queuing follows its finish.");
  return { startedAt, finishedAt };
}

function qualifiedName(input: GraphTrxParseInput, definition: TrxXmlElement): string {
  const method = trxChild(definition, "TestMethod")!;
  const { project, configuration, framework, runtime, assembly } = input.target;
  const name = JSON.stringify([
    project,
    configuration,
    framework,
    runtime ?? "",
    assembly,
    guid(definition, "id"),
    get(method, "className"),
    get(method, "name"),
  ]);
  if (name.length > 200)
    trxFail("qualified test identity exceeds the 200-character limit; it cannot be truncated.");
  return name;
}

function validateCounters(summary: TrxXmlElement, tests: GraphTrxReport["tests"]): void {
  const counters = trxChild(summary, "Counters")!;
  const count = (key: string) => {
    const text = get(counters, key);
    if (!/^(?:0|[1-9][0-9]{0,3})$/.test(text) || Number(text) > 1000)
      trxFail("invalid or oversized test counter.");
    return Number(text);
  };
  const passed = tests.filter((test) => test.status === "passed").length;
  const failed = tests.filter((test) => test.status === "failed").length;
  const skipped = tests.filter((test) => test.status === "skipped").length;
  if (
    count("total") !== tests.length ||
    count("executed") !== passed + failed ||
    count("passed") !== passed ||
    count("failed") !== failed
  )
    trxFail("result counters do not reconcile.");
  // 已证实的 VSTest 17.11.1 缺陷仅允许 notExecuted=0；正数仍必须与实际跳过条目完全相等。
  if (count("notExecuted") !== 0 && count("notExecuted") !== skipped)
    trxFail("skipped counter does not reconcile.");
  for (const key of [
    "error",
    "timeout",
    "aborted",
    "inconclusive",
    "passedButRunAborted",
    "notRunnable",
    "disconnected",
    "warning",
    "completed",
    "inProgress",
    "pending",
  ])
    if (count(key) !== 0) trxFail("unsupported/incomplete execution counter is nonzero.");
  if (get(summary, "outcome") !== (failed ? "Failed" : "Completed"))
    trxFail("summary outcome does not reconcile.");
  const output = trxChild(summary, "Output", false);
  if (output && trxChild(output, "ErrorInfo", false))
    trxFail("run-level errors cannot establish assertion evidence.");
}

/** Parses observations only; native/source/build/operation authority belongs to the Graph owner. */
export function parseGraphTrxReport(input: GraphTrxParseInput): GraphTrxReport {
  const root = parseTrxXml(input.bytes);
  if (root.name !== "TestRun" || root.attributes.xmlns !== NAMESPACE)
    trxFail("unsupported root or default namespace.");
  validateTrxShape(root);
  const compareAssembly = trxAssemblyComparator(input);
  const reportId = guid(root, "id");
  const times = reportTimes(root, input);
  const unique = new Set<string>([reportId]);
  const register = (value: string) => {
    if (unique.has(value)) trxFail("duplicate report/test/execution identity.");
    unique.add(value);
  };
  const settings = trxChild(root, "TestSettings")!;
  register(guid(settings, "id"));
  trxChild(settings, "Deployment");
  const lists = trxChild(root, "TestLists")!;
  const listIds = new Set(
    trxChildren(lists, "TestList").map((list) => {
      const id = guid(list, "id");
      get(list, "name");
      register(id);
      return id;
    }),
  );
  if (!listIds.size) trxFail("test list inventory is missing.");
  const definitions = new Map<string, TrxXmlElement>();
  for (const definition of children(root, "TestDefinitions", "UnitTest")) {
    const id = guid(definition, "id");
    register(id);
    register(guid(trxChild(definition, "Execution")!, "id"));
    const method = trxChild(definition, "TestMethod")!;
    get(method, "adapterTypeName");
    compareAssembly(get(method, "codeBase"));
    compareAssembly(get(definition, "storage"));
    definitions.set(id, definition);
  }
  const entries = new Map<string, TrxXmlElement>();
  for (const entry of children(root, "TestEntries", "TestEntry")) {
    const id = guid(entry, "testId");
    if (entries.has(id)) trxFail("duplicate test entry.");
    entries.set(id, entry);
  }
  const results = children(root, "Results", "UnitTestResult");
  if (
    results.length > 1000 ||
    results.length !== definitions.size ||
    results.length !== entries.size
  )
    trxFail("result/definition/entry inventory mismatch or test limit exceeded.");
  const resultIds = new Set<string>();
  const executionIds = new Set<string>();
  const names = new Set<string>();
  const tests: GraphTrxReport["tests"] = results.map((result) => {
    const id = guid(result, "testId");
    const executionId = guid(result, "executionId");
    if (resultIds.has(id) || executionIds.has(executionId))
      trxFail("duplicate test/execution result.");
    resultIds.add(id);
    executionIds.add(executionId);
    const definition = definitions.get(id),
      entry = entries.get(id);
    if (
      !definition ||
      !entry ||
      guid(trxChild(definition, "Execution")!, "id") !== executionId ||
      guid(entry, "executionId") !== executionId ||
      get(definition, "name") !== get(result, "testName")
    )
      return trxFail("test result does not match its definition/entry.");
    const listId = guid(result, "testListId");
    if (
      !listIds.has(listId) ||
      guid(entry, "testListId") !== listId ||
      guid(result, "testType") !== UNIT_TEST
    )
      trxFail("unsupported test type or test list identity.");
    if (
      result.attributes.relativeResultsDirectory !== undefined &&
      trxGuid(result.attributes.relativeResultsDirectory) !== executionId
    )
      trxFail("unexpected result-directory identity.");
    const startedAt = trxTime(get(result, "startTime"));
    const finishedAt = trxTime(get(result, "endTime"));
    trxWindow(startedAt, times.startedAt, times.finishedAt);
    trxWindow(finishedAt, startedAt, times.finishedAt);
    // B1-F1：xUnit 2.5.3 独立填写 Duration，VSTest 的起止时间可来自构造时的两次 UtcNow。
    // 因此不能用时间戳差值校验耗时；仍校验耗时格式/范围和上方的完整时间窗。
    trxDuration(get(result, "duration"));
    const outcome = get(result, "outcome");
    if (!["Passed", "Failed", "NotExecuted"].includes(outcome))
      trxFail("unsupported or nonterminal test outcome.");
    const output = trxChild(result, "Output", false);
    if (outcome !== "Failed" && output && trxChild(output, "ErrorInfo", false))
      trxFail("nonfailed result contains error evidence.");
    const name = qualifiedName(input, definition);
    if (names.has(name)) trxFail("duplicate qualified test identity.");
    names.add(name);
    return {
      name,
      status: outcome === "Passed" ? "passed" : outcome === "Failed" ? "failed" : "skipped",
    };
  });
  const summary = trxChild(root, "ResultSummary")!;
  validateCounters(summary, tests);
  validateTrxRunInfos(children(summary, "RunInfos", "RunInfo"), results, definitions, times);
  tests.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  return { parserVersion: "dotnet-vstest-trx-v1", reportId, ...times, tests };
}
