import type { TrxXmlElement } from "./trx-xml.js";

interface Shape {
  attributes: string[];
  children: string[];
  text?: boolean;
}
const shape = (attributes = "", children = "", text = false): Shape => ({
  attributes: attributes.split(" ").filter(Boolean),
  children: children.split(" ").filter(Boolean),
  text,
});
const shapes: Record<string, Shape> = {
  TestRun: shape(
    "id name runUser xmlns",
    "Times TestSettings Results TestDefinitions TestEntries TestLists ResultSummary",
  ),
  Times: shape("creation queuing start finish"),
  TestSettings: shape("name id", "Deployment"),
  Deployment: shape("runDeploymentRoot userDeploymentRoot"),
  Results: shape("", "UnitTestResult"),
  UnitTestResult: shape(
    "executionId testId testName computerName duration startTime endTime testType outcome testListId relativeResultsDirectory",
    "Output",
  ),
  Output: shape("", "StdOut StdErr DebugTrace ErrorInfo"),
  StdOut: shape("", "", true),
  StdErr: shape("", "", true),
  DebugTrace: shape("", "", true),
  ErrorInfo: shape("", "Message StackTrace"),
  Message: shape("", "", true),
  StackTrace: shape("", "", true),
  TestDefinitions: shape("", "UnitTest"),
  UnitTest: shape("name storage id", "Execution TestMethod"),
  Execution: shape("id"),
  TestMethod: shape("codeBase adapterTypeName className name"),
  TestEntries: shape("", "TestEntry"),
  TestEntry: shape("testId executionId testListId"),
  TestLists: shape("", "TestList"),
  TestList: shape("name id"),
  ResultSummary: shape("outcome", "Counters Output RunInfos"),
  Counters: shape(
    "total executed passed failed error timeout aborted inconclusive passedButRunAborted notRunnable notExecuted disconnected warning completed inProgress pending",
  ),
  RunInfos: shape("", "RunInfo"),
  RunInfo: shape("computerName outcome timestamp", "Text"),
  Text: shape("", "", true),
};
export const trxFail = (message: string): never => {
  throw new Error(`TRX report: ${message}`);
};
export function trxAttribute(node: TrxXmlElement, name: string): string {
  const value = node.attributes[name];
  if (typeof value !== "string" || !value.trim()) return trxFail(`missing ${node.name}.${name}.`);
  return value;
}
export function trxChildren(node: TrxXmlElement, name: string): TrxXmlElement[] {
  return node.children.filter((child) => child.name === name);
}
export function trxChild(
  node: TrxXmlElement,
  name: string,
  required = true,
): TrxXmlElement | undefined {
  const values = trxChildren(node, name);
  if (values.length > 1 || (required && !values.length)) trxFail(`missing or duplicate ${name}.`);
  return values[0];
}
/** Exact supported default-namespace grammar; unknown results/attachments cannot disappear. */
export function validateTrxShape(node: TrxXmlElement): void {
  const selected = Object.hasOwn(shapes, node.name) ? shapes[node.name]! : undefined;
  if (!selected) return trxFail("unsupported element.");
  if (
    Object.keys(node.attributes).some((key) => !selected.attributes.includes(key)) ||
    node.children.some((child) => !selected.children.includes(child.name)) ||
    (!selected.text && /[^\t\n\r ]/.test(node.text))
  )
    trxFail("unsupported element, namespace, attribute or mixed content.");
  for (const child of node.children) validateTrxShape(child);
  // 只允许明确列出的重复集合，其余重复容器会掩盖部分结果，必须拒绝。
  if (!["Results", "TestDefinitions", "TestEntries", "TestLists", "RunInfos"].includes(node.name))
    for (const name of selected.children) trxChild(node, name, false);
}
