import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { GraphTrxParseInput } from "../dotnet-types.js";
import { parseGraphTrxReport } from "../domain/trx-report.js";

// B1-F1：真实 .304 报告的脱敏派生数据；只替换机器/用户/绝对路径元数据并统一 LF。
// 保留独立生成的 duration/start/end、标识关联与计数；不是新的原生执行证据。
const xml = await readFile(new URL("./fixtures/b1-xunit-derived.trx", import.meta.url), "utf8");
const input = (text = xml): GraphTrxParseInput => ({
  bytes: new TextEncoder().encode(text),
  target: {
    project: "Tests/B1.Tests.csproj",
    configuration: "Debug",
    framework: "net8.0",
    assembly: "Tests/bin/Debug/net8.0/B1.Tests.dll",
  },
  expectedAssemblyPath: "C:\\fixture\\workspace\\Tests\\bin\\Debug\\net8.0\\B1.Tests.dll",
  pathCase: "insensitive",
  startedAt: 1791204215102,
  completedAt: 1791204216095,
});

test("B1 xUnit independent duration and result timestamps normalize three passing observations", () => {
  assert.match(xml, /duration="00:00:00.0035573"/);
  const report = parseGraphTrxReport(input());
  assert.equal(report.parserVersion, "dotnet-vstest-trx-v1");
  assert.equal(report.reportId, "159eb2a9-c523-484a-9fd6-f75eb90db399");
  assert.deepEqual(
    report.tests.map((item) => item.status),
    ["passed", "passed", "passed"],
  );
  assert.deepEqual(report.tests.map((item) => JSON.parse(item.name).at(-1)).sort(), [
    "AddNegative",
    "AddPositive",
    "AddZero",
  ]);
});

for (const duration of [
  "invalid",
  "-00:00:00.001",
  "10000.00:00:00",
  "00:60:00",
  "24:00:00",
  "NaN",
  "Infinity",
  "00:00:00.12345678",
])
  test("B1 independent duration still rejects " + duration, () => {
    assert.throws(
      () =>
        parseGraphTrxReport(input(xml.replace(/duration="[^"]+"/, 'duration="' + duration + '"'))),
      /invalid test duration/,
    );
  });

test("B1 independent timing retains report/native chronology and identity checks", () => {
  for (const [from, to] of [
    [
      'startTime="2026-10-05T20:43:35.9949992+08:00"',
      'startTime="2026-10-05T20:43:36.0000000+08:00"',
    ],
    ['endTime="2026-10-05T20:43:35.9950067+08:00"', 'endTime="2026-10-05T20:43:35.0000000+08:00"'],
    ['creation="2026-10-05T20:43:36.0514787+08:00"', 'creation="2020-01-01T00:00:00Z"'],
    ['finish="2026-10-05T20:43:36.0544500+08:00"', 'finish="2026-10-05T20:43:35.5000000+08:00"'],
    ['total="3"', 'total="4"'],
    [
      '<Execution id="3d7d171b-c4e9-4b2a-b856-9d86938e6d08"',
      '<Execution id="11111111-1111-1111-1111-111111111111"',
    ],
  ]) {
    assert.ok(xml.includes(from));
    assert.throws(() => parseGraphTrxReport(input(xml.replace(from, to))), /TRX/);
  }
  assert.throws(() => parseGraphTrxReport({ ...input(), completedAt: 1791204216000 }), /window/);
  assert.throws(
    () =>
      parseGraphTrxReport({
        ...input(),
        expectedAssemblyPath: "C:\\fixture\\workspace\\Other.dll",
      }),
    /assembly/i,
  );
});
