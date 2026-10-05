import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseGraphTrxReport } from "../domain/trx-report.js";

const xml = await readFile(
  new URL("./fixtures/b1-xunit-failed-derived.trx", import.meta.url),
  "utf8",
);
const parse = (text = xml) =>
  parseGraphTrxReport({
    bytes: new TextEncoder().encode(text),
    target: {
      project: "Tests/B1.Tests.csproj",
      configuration: "Debug",
      framework: "net8.0",
      assembly: "Tests/bin/Debug/net8.0/B1.Tests.dll",
    },
    expectedAssemblyPath: "C:\\fixture\\workspace\\Tests\\bin\\Debug\\net8.0\\B1.Tests.dll",
    pathCase: "insensitive",
    startedAt: 1791208822514,
    completedAt: 1791208823453,
  });
const echo = "[xUnit.net 00:00:00.09]     B1.Tests.ArithmeticTests.AddPositive [FAIL]";
const info = xml.match(/<RunInfo\b[\s\S]*?<\/RunInfo>/)![0];
const add = (text: string) => xml.replace("</RunInfos>", info.replace(echo, text) + "</RunInfos>");
const rejected = (text: string) => assert.throws(() => parse(text), /TRX/);

test("genuine-derived xUnit failure echo preserves three tests and the real failed observation", () => {
  const report = parse();
  assert.equal(report.reportId, "14fc080b-c5cb-4857-aa7b-98af59187f52");
  assert.deepEqual(
    report.tests.map((t) => t.status),
    ["passed", "failed", "passed"],
  );
  assert.deepEqual(parse(xml.replace(/<RunInfos>[\s\S]*?<\/RunInfos>/, "")).tests, report.tests);
});

for (const diagnostic of [
  "[xUnit.net 00:00:00.09]     [FATAL ERROR] System.Exception",
  "[xUnit.net 00:00:00.09]     [Test Assembly Cleanup Failure (B1.Tests)] System.Exception",
  "The active test run was aborted. Reason: Test host process crashed",
  "Adapter initialization failed",
])
  test("known echo cannot hide unrelated diagnostic: " + diagnostic, () =>
    rejected(add(diagnostic)),
  );

for (const diagnostic of [
  echo.replace("AddPositive", "AddPositiveExtra"),
  echo.replace("AddPositive", "Add"),
  echo.replace("AddPositive", "AddZero"),
  echo.replace("AddPositive", "Unknown"),
  echo.replace("00:00:00.09", "00:60:00.09"),
  echo.replace("00:00:00.09", "24:00:00.09"),
  echo.replace("00:00:00.09", "00:00:00.9"),
  echo.replace("     ", "    "),
  "prefix " + echo,
  echo + " suffix",
  echo + "\n",
  echo + "\nrunner error",
  echo.replace("[FAIL]", "[fail]"),
])
  test("exact failure echo rejects " + JSON.stringify(diagnostic), () =>
    rejected(xml.replace(echo, diagnostic)),
  );

test("diagnostic cannot create tests, bypass severity/producer or repeat a result", () => {
  rejected(xml.replace(info, info.replace('outcome="Error"', 'outcome="Warning"')));
  rejected(xml.replace(info, info.replace('outcome="Error"', 'outcome="Failed"')));
  rejected(xml.replaceAll("executor://xunit/VsTestRunner2/netcoreapp", "executor://unknown"));
  rejected(add(echo));
  rejected(xml.replace(/<Results>[\s\S]*?<\/Results>/, "<Results/>"));
  rejected(xml.replace(/<Text>[\s\S]*?<\/Text>/, "<Text/>"));
});

test("ambiguous display names across failed and passing results are rejected", () => {
  rejected(
    xml
      .replaceAll(
        'testName="B1.Tests.ArithmeticTests.AddZero"',
        'testName="B1.Tests.ArithmeticTests.AddPositive"',
      )
      .replaceAll(
        'UnitTest name="B1.Tests.ArithmeticTests.AddZero"',
        'UnitTest name="B1.Tests.ArithmeticTests.AddPositive"',
      ),
  );
});

test("producer escaping and XML decoding are exact; escaping collisions are ambiguous", () => {
  const name = "B1 &amp; &quot;theory&quot;&#xD;&#xA;&#x9;value";
  const changed = xml
    .replaceAll('testName="B1.Tests.ArithmeticTests.AddPositive"', 'testName="' + name + '"')
    .replaceAll(
      'UnitTest name="B1.Tests.ArithmeticTests.AddPositive"',
      'UnitTest name="' + name + '"',
    )
    .replace(echo, "[xUnit.net 00:00:00.09]     B1 &amp; &quot;theory&quot;\\r\\n\\tvalue [FAIL]");
  assert.deepEqual(parse(changed).tests, parse().tests);
  const ambiguous = changed
    .replaceAll(
      'testName="B1.Tests.ArithmeticTests.AddZero"',
      'testName="B1 &amp; &quot;theory&quot;\\r\\n\\tvalue"',
    )
    .replaceAll(
      'UnitTest name="B1.Tests.ArithmeticTests.AddZero"',
      'UnitTest name="B1 &amp; &quot;theory&quot;\\r\\n\\tvalue"',
    );
  rejected(ambiguous);
});

test("known echo does not relax timestamps, counters, inventory, joins, assembly or run errors", () => {
  for (const changed of [
    xml.replace(/timestamp="[^"]+"/, 'timestamp="2020-01-01T00:00:00Z"'),
    xml.replace(/timestamp="[^"]+"/, 'timestamp="2030-01-01T00:00:00Z"'),
    xml.replace('failed="1"', 'failed="0"'),
    xml.replace('error="0"', 'error="1"'),
    xml.replace(/<Execution id="[^"]+"/, '<Execution id="11111111-1111-4111-8111-111111111111"'),
    xml.replace(/<TestEntry\b[^>]+\/>/, ""),
    xml.replaceAll("B1.Tests.dll", "Other.dll"),
    xml.replace(/endTime="[^"]+"/, 'endTime="2030-01-01T00:00:00Z"'),
    xml.replace(
      "<RunInfos>",
      "<Output><ErrorInfo><Message>runner error</Message></ErrorInfo></Output><RunInfos>",
    ),
  ])
    rejected(changed);
});
