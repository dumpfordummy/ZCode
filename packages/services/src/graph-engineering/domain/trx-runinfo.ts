import { trxAttribute, trxChild, trxFail } from "./trx-shape.js";
import { trxTime, trxWindow } from "./trx-values.js";
import type { TrxXmlElement } from "./trx-xml.js";

const escapeName = (value: string) =>
  value
    .replaceAll("\r", "\\r")
    .replaceAll("\n", "\\n")
    .replaceAll("\t", "\\t")
    .replaceAll("\0", "\\0");

/** Called only after complete result/definition/entry and counter validation. */
export function validateTrxRunInfos(
  infos: TrxXmlElement[],
  results: TrxXmlElement[],
  definitions: Map<string, TrxXmlElement>,
  times: { startedAt: number; finishedAt: number },
): void {
  const echoed = new Set<TrxXmlElement>();
  for (const info of infos) {
    trxWindow(trxTime(trxAttribute(info, "timestamp")), times.startedAt, times.finishedAt);
    const text = trxChild(info, "Text")!.text;
    const outcome = trxAttribute(info, "outcome");
    // 原因：零条目警告只能保留空观察；不能从 RunInfo 合成测试或绕过 owner 的最小条目检查。
    if (results.length === 0 && outcome === "Warning") continue;
    // B1-F2：固定生产者的断言失败回显不是额外基础设施错误；按完整转义名称关联已验证的失败条目。
    // 格式依据：xUnit reporter 2.5.2 + VS adapter 2.5.3；不 trim、不接受前后缀或其他诊断。
    const prefix = /^\[xUnit\.net (?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\.[0-9]{2}\]     /.exec(
      text,
    );
    if (outcome !== "Error" || !prefix)
      trxFail("unexplained run diagnostic cannot establish complete assertions.");
    const matches = results.filter(
      (result) => text === prefix![0] + escapeName(trxAttribute(result, "testName")) + " [FAIL]",
    );
    if (matches.length !== 1) trxFail("run diagnostic does not uniquely match a test result.");
    const result = matches[0]!;
    const definition = definitions.get(trxAttribute(result, "testId").toLowerCase())!;
    if (
      trxAttribute(result, "outcome") !== "Failed" ||
      trxAttribute(trxChild(definition, "TestMethod")!, "adapterTypeName") !==
        "executor://xunit/VsTestRunner2/netcoreapp" ||
      echoed.has(result)
    )
      trxFail("run diagnostic is not a unique supported failed-test echo.");
    echoed.add(result);
  }
}
