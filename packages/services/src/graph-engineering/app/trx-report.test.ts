import assert from "node:assert/strict";
import test from "node:test";
import type { GraphTrxParseInput } from "../dotnet-types.js";
import { parseGraphTrxReport } from "../domain/trx-report.js";

// Metadata-anonymized snapshots of genuine SDK 8.0.425 / VSTest 17.11.1 output.
// Only local workspace/user/computer strings changed. These are parser regression data,
// not execution evidence; pre-z8-dotnet-fixture.test.mjs exercises unmodified native bytes.
const captures = {
  passed: {
    xml: '﻿<?xml version="1.0" encoding="utf-8"?>\r\n<TestRun id="d4dbc481-a94e-4136-b46a-1f9168d8f148" name="Fixture@SYNTHETIC 2026-09-27 03:27:03" runUser="SYNTHETIC\\FixtureAccount" xmlns="http://microsoft.com/schemas/VisualStudio/TeamTest/2010">\r\n  <Times creation="2026-09-27T03:27:03.1463910+08:00" queuing="2026-09-27T03:27:03.1463911+08:00" start="2026-09-27T03:27:02.9089553+08:00" finish="2026-09-27T03:27:03.1495308+08:00" />\r\n  <TestSettings name="default" id="98d59309-ed6b-46a7-ba8d-9d85ef42ffbe">\r\n    <Deployment runDeploymentRoot="Fixture_SYNTHETIC_2026-09-27_03_27_03" />\r\n  </TestSettings>\r\n  <Results>\r\n    <UnitTestResult executionId="c70b2278-db24-4747-b905-a1d69a5dc476" testId="eb90d76a-b7d2-1711-e640-281b24b699e2" testName="AddPositive" computerName="SYNTHETIC" duration="00:00:00.0004236" startTime="2026-09-27T03:27:03.1011036+08:00" endTime="2026-09-27T03:27:03.1015272+08:00" testType="13cdc9d9-ddb5-4fa4-a97d-d965ccfc6d4b" outcome="Passed" testListId="8c84fa94-04c1-424b-9868-57a2d4851a1d" relativeResultsDirectory="c70b2278-db24-4747-b905-a1d69a5dc476" />\r\n    <UnitTestResult executionId="7914452e-69c5-4994-aff4-2fb89826a656" testId="a9c69394-5c95-5f01-a507-bde7ed1cee2d" testName="AddNegative" computerName="SYNTHETIC" duration="00:00:00.0000457" startTime="2026-09-27T03:27:03.1021816+08:00" endTime="2026-09-27T03:27:03.1022273+08:00" testType="13cdc9d9-ddb5-4fa4-a97d-d965ccfc6d4b" outcome="Passed" testListId="8c84fa94-04c1-424b-9868-57a2d4851a1d" relativeResultsDirectory="7914452e-69c5-4994-aff4-2fb89826a656" />\r\n    <UnitTestResult executionId="4c78c7fa-41f7-4434-97fc-02cfb7c6fbc1" testId="3396595b-4ddb-d83c-abbe-c28451dd3ee4" testName="AddZero" computerName="SYNTHETIC" duration="00:00:00.0000271" startTime="2026-09-27T03:27:03.1023890+08:00" endTime="2026-09-27T03:27:03.1024161+08:00" testType="13cdc9d9-ddb5-4fa4-a97d-d965ccfc6d4b" outcome="Passed" testListId="8c84fa94-04c1-424b-9868-57a2d4851a1d" relativeResultsDirectory="4c78c7fa-41f7-4434-97fc-02cfb7c6fbc1" />\r\n    <UnitTestResult executionId="5ae54918-b342-4f34-b606-1bfdd81fc750" testId="6c2afd56-f545-e780-a8c9-04b81c4bf4a4" testName="Disabled" computerName="SYNTHETIC" duration="00:00:00.0001379" startTime="2026-09-27T03:27:03.1024617+08:00" endTime="2026-09-27T03:27:03.1025996+08:00" testType="13cdc9d9-ddb5-4fa4-a97d-d965ccfc6d4b" outcome="NotExecuted" testListId="8c84fa94-04c1-424b-9868-57a2d4851a1d" relativeResultsDirectory="5ae54918-b342-4f34-b606-1bfdd81fc750" />\r\n  </Results>\r\n  <TestDefinitions>\r\n    <UnitTest name="AddNegative" storage="c:\\fixture\\workspace\\bin\\release\\net8.0\\fixture.tests.dll" id="a9c69394-5c95-5f01-a507-bde7ed1cee2d">\r\n      <Execution id="7914452e-69c5-4994-aff4-2fb89826a656" />\r\n      <TestMethod codeBase="C:\\fixture\\workspace\\bin\\Release\\net8.0\\Fixture.Tests.dll" adapterTypeName="executor://pre-z8-synthetic/v1" className="PreZ8Fixture.Cases" name="AddNegative" />\r\n    </UnitTest>\r\n    <UnitTest name="Disabled" storage="c:\\fixture\\workspace\\bin\\release\\net8.0\\fixture.tests.dll" id="6c2afd56-f545-e780-a8c9-04b81c4bf4a4">\r\n      <Execution id="5ae54918-b342-4f34-b606-1bfdd81fc750" />\r\n      <TestMethod codeBase="C:\\fixture\\workspace\\bin\\Release\\net8.0\\Fixture.Tests.dll" adapterTypeName="executor://pre-z8-synthetic/v1" className="PreZ8Fixture.Cases" name="Disabled" />\r\n    </UnitTest>\r\n    <UnitTest name="AddZero" storage="c:\\fixture\\workspace\\bin\\release\\net8.0\\fixture.tests.dll" id="3396595b-4ddb-d83c-abbe-c28451dd3ee4">\r\n      <Execution id="4c78c7fa-41f7-4434-97fc-02cfb7c6fbc1" />\r\n      <TestMethod codeBase="C:\\fixture\\workspace\\bin\\Release\\net8.0\\Fixture.Tests.dll" adapterTypeName="executor://pre-z8-synthetic/v1" className="PreZ8Fixture.Cases" name="AddZero" />\r\n    </UnitTest>\r\n    <UnitTest name="AddPositive" storage="c:\\fixture\\workspace\\bin\\release\\net8.0\\fixture.tests.dll" id="eb90d76a-b7d2-1711-e640-281b24b699e2">\r\n      <Execution id="c70b2278-db24-4747-b905-a1d69a5dc476" />\r\n      <TestMethod codeBase="C:\\fixture\\workspace\\bin\\Release\\net8.0\\Fixture.Tests.dll" adapterTypeName="executor://pre-z8-synthetic/v1" className="PreZ8Fixture.Cases" name="AddPositive" />\r\n    </UnitTest>\r\n  </TestDefinitions>\r\n  <TestEntries>\r\n    <TestEntry testId="eb90d76a-b7d2-1711-e640-281b24b699e2" executionId="c70b2278-db24-4747-b905-a1d69a5dc476" testListId="8c84fa94-04c1-424b-9868-57a2d4851a1d" />\r\n    <TestEntry testId="a9c69394-5c95-5f01-a507-bde7ed1cee2d" executionId="7914452e-69c5-4994-aff4-2fb89826a656" testListId="8c84fa94-04c1-424b-9868-57a2d4851a1d" />\r\n    <TestEntry testId="3396595b-4ddb-d83c-abbe-c28451dd3ee4" executionId="4c78c7fa-41f7-4434-97fc-02cfb7c6fbc1" testListId="8c84fa94-04c1-424b-9868-57a2d4851a1d" />\r\n    <TestEntry testId="6c2afd56-f545-e780-a8c9-04b81c4bf4a4" executionId="5ae54918-b342-4f34-b606-1bfdd81fc750" testListId="8c84fa94-04c1-424b-9868-57a2d4851a1d" />\r\n  </TestEntries>\r\n  <TestLists>\r\n    <TestList name="Results Not in a List" id="8c84fa94-04c1-424b-9868-57a2d4851a1d" />\r\n    <TestList name="All Loaded Results" id="19431567-8539-422a-85d7-44ee4e166bda" />\r\n  </TestLists>\r\n  <ResultSummary outcome="Completed">\r\n    <Counters total="4" executed="3" passed="3" failed="0" error="0" timeout="0" aborted="0" inconclusive="0" passedButRunAborted="0" notRunnable="0" notExecuted="0" disconnected="0" warning="0" completed="0" inProgress="0" pending="0" />\r\n    <Output>\r\n      <StdOut>Logging TestHost Diagnostics in file: C:\\fixture\\workspace\\results\\4ce21277-070f-4ba8-8da3-b2ae458642aa\\vstest.host.26-09-27_03-27-02_92638_5.log&#xD;\nTest \'Disabled\' was skipped in the test run.&#xD;\n</StdOut>\r\n    </Output>\r\n  </ResultSummary>\r\n</TestRun>',
    startedAt: 1790450822402,
    completedAt: 1790450823185,
    originalDigest: "4fb59523ab6f30330bc04253b00fd2cc6be73f1f0b7ec7ce77774648d97586d6",
  },
  failed: {
    xml: '﻿<?xml version="1.0" encoding="utf-8"?>\r\n<TestRun id="2fd62bb2-d3d2-4f39-864d-3331646054aa" name="Fixture@SYNTHETIC 2026-09-27 03:27:13" runUser="SYNTHETIC\\FixtureAccount" xmlns="http://microsoft.com/schemas/VisualStudio/TeamTest/2010">\r\n  <Times creation="2026-09-27T03:27:13.3305046+08:00" queuing="2026-09-27T03:27:13.3305047+08:00" start="2026-09-27T03:27:13.0832278+08:00" finish="2026-09-27T03:27:13.3337663+08:00" />\r\n  <TestSettings name="default" id="5ae8c8fa-34fb-4062-8d4e-b855297a40cd">\r\n    <Deployment runDeploymentRoot="Fixture_SYNTHETIC_2026-09-27_03_27_13" />\r\n  </TestSettings>\r\n  <Results>\r\n    <UnitTestResult executionId="717207c1-fa41-41e8-9d7a-47cde8d6db37" testId="3396595b-4ddb-d83c-abbe-c28451dd3ee4" testName="AddZero" computerName="SYNTHETIC" duration="00:00:00.0000766" startTime="2026-09-27T03:27:13.2869847+08:00" endTime="2026-09-27T03:27:13.2870613+08:00" testType="13cdc9d9-ddb5-4fa4-a97d-d965ccfc6d4b" outcome="Failed" testListId="8c84fa94-04c1-424b-9868-57a2d4851a1d" relativeResultsDirectory="717207c1-fa41-41e8-9d7a-47cde8d6db37">\r\n      <Output>\r\n        <ErrorInfo>\r\n          <Message>Expected 0, actual 1.</Message>\r\n          <StackTrace>   at PreZ8Fixture.Cases.Equal(Int32 expected, Int32 actual) in C:\\fixture\\workspace\\Cases.cs:line 14&#xD;\n   at PreZ8Fixture.Cases.AddZero() in C:\\fixture\\workspace\\Cases.cs:line 19&#xD;\n   at System.RuntimeMethodHandle.InvokeMethod(Object target, Void** arguments, Signature sig, Boolean isConstructor)&#xD;\n   at System.Reflection.MethodBaseInvoker.InvokeWithNoArgs(Object obj, BindingFlags invokeAttr)</StackTrace>\r\n        </ErrorInfo>\r\n      </Output>\r\n    </UnitTestResult>\r\n    <UnitTestResult executionId="e2398ce0-a6ea-4a3f-a168-b6d3b68a31a3" testId="6c2afd56-f545-e780-a8c9-04b81c4bf4a4" testName="Disabled" computerName="SYNTHETIC" duration="00:00:00.0001560" startTime="2026-09-27T03:27:13.2871369+08:00" endTime="2026-09-27T03:27:13.2872929+08:00" testType="13cdc9d9-ddb5-4fa4-a97d-d965ccfc6d4b" outcome="NotExecuted" testListId="8c84fa94-04c1-424b-9868-57a2d4851a1d" relativeResultsDirectory="e2398ce0-a6ea-4a3f-a168-b6d3b68a31a3" />\r\n    <UnitTestResult executionId="d02d71a0-87d5-4cdb-b4b5-ece29cadc9d8" testId="eb90d76a-b7d2-1711-e640-281b24b699e2" testName="AddPositive" computerName="SYNTHETIC" duration="00:00:00.0030687" startTime="2026-09-27T03:27:13.2828931+08:00" endTime="2026-09-27T03:27:13.2859618+08:00" testType="13cdc9d9-ddb5-4fa4-a97d-d965ccfc6d4b" outcome="Failed" testListId="8c84fa94-04c1-424b-9868-57a2d4851a1d" relativeResultsDirectory="d02d71a0-87d5-4cdb-b4b5-ece29cadc9d8">\r\n      <Output>\r\n        <ErrorInfo>\r\n          <Message>Expected 5, actual 6.</Message>\r\n          <StackTrace>   at PreZ8Fixture.Cases.Equal(Int32 expected, Int32 actual) in C:\\fixture\\workspace\\Cases.cs:line 14&#xD;\n   at PreZ8Fixture.Cases.AddPositive() in C:\\fixture\\workspace\\Cases.cs:line 17&#xD;\n   at System.RuntimeMethodHandle.InvokeMethod(Object target, Void** arguments, Signature sig, Boolean isConstructor)&#xD;\n   at System.Reflection.MethodBaseInvoker.InvokeWithNoArgs(Object obj, BindingFlags invokeAttr)</StackTrace>\r\n        </ErrorInfo>\r\n      </Output>\r\n    </UnitTestResult>\r\n    <UnitTestResult executionId="a9066d7f-972f-464b-ae9d-1a7640004d7e" testId="a9c69394-5c95-5f01-a507-bde7ed1cee2d" testName="AddNegative" computerName="SYNTHETIC" duration="00:00:00.0001125" startTime="2026-09-27T03:27:13.2866812+08:00" endTime="2026-09-27T03:27:13.2867937+08:00" testType="13cdc9d9-ddb5-4fa4-a97d-d965ccfc6d4b" outcome="Failed" testListId="8c84fa94-04c1-424b-9868-57a2d4851a1d" relativeResultsDirectory="a9066d7f-972f-464b-ae9d-1a7640004d7e">\r\n      <Output>\r\n        <ErrorInfo>\r\n          <Message>Expected 0, actual 1.</Message>\r\n          <StackTrace>   at PreZ8Fixture.Cases.Equal(Int32 expected, Int32 actual) in C:\\fixture\\workspace\\Cases.cs:line 14&#xD;\n   at PreZ8Fixture.Cases.AddNegative() in C:\\fixture\\workspace\\Cases.cs:line 18&#xD;\n   at System.RuntimeMethodHandle.InvokeMethod(Object target, Void** arguments, Signature sig, Boolean isConstructor)&#xD;\n   at System.Reflection.MethodBaseInvoker.InvokeWithNoArgs(Object obj, BindingFlags invokeAttr)</StackTrace>\r\n        </ErrorInfo>\r\n      </Output>\r\n    </UnitTestResult>\r\n  </Results>\r\n  <TestDefinitions>\r\n    <UnitTest name="AddNegative" storage="c:\\fixture\\workspace\\bin\\release\\net8.0\\fixture.tests.dll" id="a9c69394-5c95-5f01-a507-bde7ed1cee2d">\r\n      <Execution id="a9066d7f-972f-464b-ae9d-1a7640004d7e" />\r\n      <TestMethod codeBase="C:\\fixture\\workspace\\bin\\Release\\net8.0\\Fixture.Tests.dll" adapterTypeName="executor://pre-z8-synthetic/v1" className="PreZ8Fixture.Cases" name="AddNegative" />\r\n    </UnitTest>\r\n    <UnitTest name="Disabled" storage="c:\\fixture\\workspace\\bin\\release\\net8.0\\fixture.tests.dll" id="6c2afd56-f545-e780-a8c9-04b81c4bf4a4">\r\n      <Execution id="e2398ce0-a6ea-4a3f-a168-b6d3b68a31a3" />\r\n      <TestMethod codeBase="C:\\fixture\\workspace\\bin\\Release\\net8.0\\Fixture.Tests.dll" adapterTypeName="executor://pre-z8-synthetic/v1" className="PreZ8Fixture.Cases" name="Disabled" />\r\n    </UnitTest>\r\n    <UnitTest name="AddZero" storage="c:\\fixture\\workspace\\bin\\release\\net8.0\\fixture.tests.dll" id="3396595b-4ddb-d83c-abbe-c28451dd3ee4">\r\n      <Execution id="717207c1-fa41-41e8-9d7a-47cde8d6db37" />\r\n      <TestMethod codeBase="C:\\fixture\\workspace\\bin\\Release\\net8.0\\Fixture.Tests.dll" adapterTypeName="executor://pre-z8-synthetic/v1" className="PreZ8Fixture.Cases" name="AddZero" />\r\n    </UnitTest>\r\n    <UnitTest name="AddPositive" storage="c:\\fixture\\workspace\\bin\\release\\net8.0\\fixture.tests.dll" id="eb90d76a-b7d2-1711-e640-281b24b699e2">\r\n      <Execution id="d02d71a0-87d5-4cdb-b4b5-ece29cadc9d8" />\r\n      <TestMethod codeBase="C:\\fixture\\workspace\\bin\\Release\\net8.0\\Fixture.Tests.dll" adapterTypeName="executor://pre-z8-synthetic/v1" className="PreZ8Fixture.Cases" name="AddPositive" />\r\n    </UnitTest>\r\n  </TestDefinitions>\r\n  <TestEntries>\r\n    <TestEntry testId="3396595b-4ddb-d83c-abbe-c28451dd3ee4" executionId="717207c1-fa41-41e8-9d7a-47cde8d6db37" testListId="8c84fa94-04c1-424b-9868-57a2d4851a1d" />\r\n    <TestEntry testId="6c2afd56-f545-e780-a8c9-04b81c4bf4a4" executionId="e2398ce0-a6ea-4a3f-a168-b6d3b68a31a3" testListId="8c84fa94-04c1-424b-9868-57a2d4851a1d" />\r\n    <TestEntry testId="eb90d76a-b7d2-1711-e640-281b24b699e2" executionId="d02d71a0-87d5-4cdb-b4b5-ece29cadc9d8" testListId="8c84fa94-04c1-424b-9868-57a2d4851a1d" />\r\n    <TestEntry testId="a9c69394-5c95-5f01-a507-bde7ed1cee2d" executionId="a9066d7f-972f-464b-ae9d-1a7640004d7e" testListId="8c84fa94-04c1-424b-9868-57a2d4851a1d" />\r\n  </TestEntries>\r\n  <TestLists>\r\n    <TestList name="Results Not in a List" id="8c84fa94-04c1-424b-9868-57a2d4851a1d" />\r\n    <TestList name="All Loaded Results" id="19431567-8539-422a-85d7-44ee4e166bda" />\r\n  </TestLists>\r\n  <ResultSummary outcome="Failed">\r\n    <Counters total="4" executed="3" passed="0" failed="3" error="0" timeout="0" aborted="0" inconclusive="0" passedButRunAborted="0" notRunnable="0" notExecuted="0" disconnected="0" warning="0" completed="0" inProgress="0" pending="0" />\r\n    <Output>\r\n      <StdOut>Logging TestHost Diagnostics in file: C:\\fixture\\workspace\\results\\2ee945d9-b833-4ff7-b381-211ef3ee8b9e\\vstest.host.26-09-27_03-27-13_10061_5.log&#xD;\nTest \'Disabled\' was skipped in the test run.&#xD;\n</StdOut>\r\n    </Output>\r\n  </ResultSummary>\r\n</TestRun>',
    startedAt: 1790450832571,
    completedAt: 1790450833365,
    originalDigest: "0ae22041486599e7e5c05cab0d7d0e5fbb3c2cc64e245ad27b578e8778c0abf1",
  },
  zero: {
    xml: '﻿<?xml version="1.0" encoding="utf-8"?>\r\n<TestRun id="c8e8d96a-e4f6-4dcd-97fd-381f6bdb5666" name="Fixture@SYNTHETIC 2026-09-27 03:27:03" runUser="SYNTHETIC\\FixtureAccount" xmlns="http://microsoft.com/schemas/VisualStudio/TeamTest/2010">\r\n  <Times creation="2026-09-27T03:27:03.9809466+08:00" queuing="2026-09-27T03:27:03.9809467+08:00" start="2026-09-27T03:27:03.7388939+08:00" finish="2026-09-27T03:27:03.9812155+08:00" />\r\n  <TestSettings name="default" id="8f5e4f6e-88e5-404e-b086-805e227bddc7">\r\n    <Deployment runDeploymentRoot="Fixture_SYNTHETIC_2026-09-27_03_27_03" />\r\n  </TestSettings>\r\n  <TestLists>\r\n    <TestList name="Results Not in a List" id="8c84fa94-04c1-424b-9868-57a2d4851a1d" />\r\n    <TestList name="All Loaded Results" id="19431567-8539-422a-85d7-44ee4e166bda" />\r\n  </TestLists>\r\n  <ResultSummary outcome="Completed">\r\n    <Counters total="0" executed="0" passed="0" failed="0" error="0" timeout="0" aborted="0" inconclusive="0" passedButRunAborted="0" notRunnable="0" notExecuted="0" disconnected="0" warning="0" completed="0" inProgress="0" pending="0" />\r\n    <Output>\r\n      <StdOut>Logging TestHost Diagnostics in file: C:\\fixture\\workspace\\results\\6e56cbc7-4cd6-436c-823c-33abcca22ec0\\vstest.host.26-09-27_03-27-03_75631_5.log&#xD;\n</StdOut>\r\n    </Output>\r\n    <RunInfos>\r\n      <RunInfo computerName="SYNTHETIC" outcome="Warning" timestamp="2026-09-27T03:27:03.9491898+08:00">\r\n        <Text>No test matches the given testcase filter `FullyQualifiedName=PreZ8Fixture.Cases.DoesNotExist` in C:\\fixture\\workspace\\bin\\Release\\net8.0\\Fixture.Tests.dll</Text>\r\n      </RunInfo>\r\n    </RunInfos>\r\n  </ResultSummary>\r\n</TestRun>',
    startedAt: 1790450823206,
    completedAt: 1790450824015,
    originalDigest: "f131872c7086fd5b1adbb517c72ddce014bed89530473f8e48342b60ebc2f5ee",
  },
  skipped: {
    xml: '﻿<?xml version="1.0" encoding="utf-8"?>\r\n<TestRun id="e3d5c6cb-df09-44e2-ab80-939f85a00520" name="Fixture@SYNTHETIC 2026-09-27 03:27:04" runUser="SYNTHETIC\\FixtureAccount" xmlns="http://microsoft.com/schemas/VisualStudio/TeamTest/2010">\r\n  <Times creation="2026-09-27T03:27:04.8095589+08:00" queuing="2026-09-27T03:27:04.8095590+08:00" start="2026-09-27T03:27:04.5589107+08:00" finish="2026-09-27T03:27:04.8128743+08:00" />\r\n  <TestSettings name="default" id="906b35d9-786f-4499-b3cb-8ee34aa0ffad">\r\n    <Deployment runDeploymentRoot="Fixture_SYNTHETIC_2026-09-27_03_27_04" />\r\n  </TestSettings>\r\n  <Results>\r\n    <UnitTestResult executionId="678649a7-ef2c-4e8b-a261-b0844ccba91d" testId="6c2afd56-f545-e780-a8c9-04b81c4bf4a4" testName="Disabled" computerName="SYNTHETIC" duration="00:00:00.0004319" startTime="2026-09-27T03:27:04.7642883+08:00" endTime="2026-09-27T03:27:04.7647202+08:00" testType="13cdc9d9-ddb5-4fa4-a97d-d965ccfc6d4b" outcome="NotExecuted" testListId="8c84fa94-04c1-424b-9868-57a2d4851a1d" relativeResultsDirectory="678649a7-ef2c-4e8b-a261-b0844ccba91d" />\r\n  </Results>\r\n  <TestDefinitions>\r\n    <UnitTest name="Disabled" storage="c:\\fixture\\workspace\\bin\\release\\net8.0\\fixture.tests.dll" id="6c2afd56-f545-e780-a8c9-04b81c4bf4a4">\r\n      <Execution id="678649a7-ef2c-4e8b-a261-b0844ccba91d" />\r\n      <TestMethod codeBase="C:\\fixture\\workspace\\bin\\Release\\net8.0\\Fixture.Tests.dll" adapterTypeName="executor://pre-z8-synthetic/v1" className="PreZ8Fixture.Cases" name="Disabled" />\r\n    </UnitTest>\r\n  </TestDefinitions>\r\n  <TestEntries>\r\n    <TestEntry testId="6c2afd56-f545-e780-a8c9-04b81c4bf4a4" executionId="678649a7-ef2c-4e8b-a261-b0844ccba91d" testListId="8c84fa94-04c1-424b-9868-57a2d4851a1d" />\r\n  </TestEntries>\r\n  <TestLists>\r\n    <TestList name="Results Not in a List" id="8c84fa94-04c1-424b-9868-57a2d4851a1d" />\r\n    <TestList name="All Loaded Results" id="19431567-8539-422a-85d7-44ee4e166bda" />\r\n  </TestLists>\r\n  <ResultSummary outcome="Completed">\r\n    <Counters total="1" executed="0" passed="0" failed="0" error="0" timeout="0" aborted="0" inconclusive="0" passedButRunAborted="0" notRunnable="0" notExecuted="0" disconnected="0" warning="0" completed="0" inProgress="0" pending="0" />\r\n    <Output>\r\n      <StdOut>Logging TestHost Diagnostics in file: C:\\fixture\\workspace\\results\\88d0b600-d604-46a6-951f-ad86ff1394d3\\vstest.host.26-09-27_03-27-04_57622_5.log&#xD;\nTest \'Disabled\' was skipped in the test run.&#xD;\n</StdOut>\r\n    </Output>\r\n  </ResultSummary>\r\n</TestRun>',
    startedAt: 1790450824038,
    completedAt: 1790450824846,
    originalDigest: "e20a3eab5309592989d2b73e14ed3f47fd623504a3bf849f2f87aea909ce8a08",
  },
};

const assembly = "C:\\fixture\\workspace\\bin\\Release\\net8.0\\Fixture.Tests.dll";
const input = (
  kind: keyof typeof captures = "passed",
  xml = captures[kind].xml,
): GraphTrxParseInput => ({
  bytes: new TextEncoder().encode(xml),
  target: {
    project: "Fixture.Tests.csproj",
    configuration: "Release",
    framework: "net8.0",
    assembly: "bin/Release/net8.0/Fixture.Tests.dll",
  },
  expectedAssemblyPath: assembly,
  pathCase: "insensitive",
  startedAt: captures[kind].startedAt,
  completedAt: captures[kind].completedAt,
});
const parse = (xml: string) => parseGraphTrxReport(input("passed", xml));
const rejected = (xml: string) => assert.throws(() => parse(xml), /TRX|XML|UTF-8/);

test("genuine-derived passing, failed, zero and all-skipped reports preserve assertion outcomes", () => {
  const passing = parseGraphTrxReport(input());
  assert.equal(passing.parserVersion, "dotnet-vstest-trx-v1");
  assert.equal(passing.tests.filter((value) => value.status === "passed").length, 3);
  assert.equal(passing.tests.filter((value) => value.status === "skipped").length, 1);
  assert.ok(passing.startedAt >= captures.passed.startedAt);
  assert.ok(passing.finishedAt <= captures.passed.completedAt);
  assert.equal(
    parseGraphTrxReport(input("failed")).tests.filter((value) => value.status === "failed").length,
    3,
  );
  assert.deepEqual(parseGraphTrxReport(input("zero")).tests, []);
  assert.deepEqual(
    parseGraphTrxReport(input("skipped")).tests.map((value) => value.status),
    ["skipped"],
  );
  assert.ok(passing.tests.every((value) => value.message === undefined));
  assert.equal(
    passing.tests.some((value) => value.name.includes("computerName")),
    false,
  );
});

test("qualified identities retain full scope and test identity without display-name dependence", () => {
  const original = parseGraphTrxReport(input());
  const name = original.tests.find((value) => value.status === "passed")!.name;
  const tuple = JSON.parse(name) as string[];
  assert.deepEqual(tuple.slice(0, 5), [
    "Fixture.Tests.csproj",
    "Release",
    "net8.0",
    "",
    "bin/Release/net8.0/Fixture.Tests.dll",
  ]);
  assert.match(tuple[5]!, /^[a-f0-9-]{36}$/);
  assert.equal(tuple[6], "PreZ8Fixture.Cases");
  assert.ok(original.tests.every((value) => value.name.length <= 200));
  const otherProject = input();
  otherProject.target = { ...otherProject.target, project: "Other.Tests.csproj" };
  assert.notDeepEqual(parseGraphTrxReport(otherProject).tests, original.tests);
  const filtered = input();
  filtered.target.filter = "FullyQualifiedName~PreZ8Fixture";
  assert.deepEqual(parseGraphTrxReport(filtered).tests, original.tests);
  const alternate = input("passed", captures.passed.xml.replaceAll("net8.0", "net6.0"));
  alternate.target = {
    ...alternate.target,
    framework: "net6.0",
    assembly: alternate.target.assembly.replace("net8.0", "net6.0"),
  };
  alternate.expectedAssemblyPath = assembly.replace("net8.0", "net6.0");
  assert.notDeepEqual(parseGraphTrxReport(alternate).tests, original.tests);
  rejected(captures.passed.xml.replaceAll("PreZ8Fixture.Cases", "N".repeat(210)));
  assert.deepEqual(
    parse(
      captures.passed.xml
        .replaceAll('testName="AddPositive"', 'testName="Human display"')
        .replaceAll('UnitTest name="AddPositive"', 'UnitTest name="Human display"'),
    ).tests,
    original.tests,
  );
});

test("supported XML predefined/numeric entities, UTF-8 BOM, comments and CDATA decode once", () => {
  const xml = captures.passed.xml
    .replaceAll('testName="AddPositive"', 'testName="A&amp;&lt;&gt;&quot;&apos;&#65;&#x1F600;"')
    .replaceAll(
      'UnitTest name="AddPositive"',
      'UnitTest name="A&amp;&lt;&gt;&quot;&apos;&#65;&#x1F600;"',
    );
  assert.equal(parse(xml).tests.length, 4);
  assert.deepEqual(
    parse("\uFEFF" + captures.passed.xml.replace(/^\uFEFF/, "")).tests,
    parse(captures.passed.xml).tests,
  );
  rejected("\uFEFF\uFEFF" + captures.passed.xml.replace(/^\uFEFF/, ""));
  assert.equal(
    parse(captures.passed.xml.replace("<Results>", "<!-- metadata comment --><Results>")).tests
      .length,
    4,
  );
  assert.equal(
    parse(
      captures.passed.xml.replace(
        /<StdOut>[\s\S]*?<\/StdOut>/,
        "<StdOut><![CDATA[No entities: &amp; <tag>]]></StdOut>",
      ),
    ).tests.length,
    4,
  );
});

test("assembly comparison is complete, separator-aware and governed by explicit path sensitivity", () => {
  assert.equal(
    parse(
      captures.passed.xml.replaceAll(
        "C:\\fixture\\workspace\\bin\\Release\\net8.0\\Fixture.Tests.dll",
        "C:/fixture/workspace/bin/Release/net8.0/Fixture.Tests.dll",
      ),
    ).tests.length,
    4,
  );
  const sensitive = input();
  sensitive.pathCase = "sensitive";
  assert.throws(() => parseGraphTrxReport(sensitive), /assembly/i);
  for (const replaced of [
    "Other.Tests.dll",
    "Fixture.Tests.dll.extra",
    "../Fixture.Tests.dll",
    "Fixture.Tests.dll:stream",
  ])
    rejected(captures.passed.xml.replaceAll("Fixture.Tests.dll", replaced));
  rejected(captures.passed.xml.replaceAll('codeBase="C:', 'codeBase="file:///C:'));
  const posix = input(
    "passed",
    captures.passed.xml
      .replaceAll(assembly, "/fixture/workspace/bin/Release/net8.0/Fixture.Tests.dll")
      .replaceAll(
        assembly.toLowerCase(),
        "/fixture/workspace/bin/Release/net8.0/Fixture.Tests.dll",
      ),
  );
  posix.expectedAssemblyPath = "/fixture/workspace/bin/Release/net8.0/Fixture.Tests.dll";
  posix.pathCase = "sensitive";
  assert.equal(parseGraphTrxReport(posix).tests.length, 4);
});

test("original byte decoding is fatal and bounded", () => {
  for (const bytes of [
    new Uint8Array(),
    new Uint8Array([0xc3, 0x28]),
    new Uint8Array(256 * 1024 + 1),
  ])
    assert.throws(() => parseGraphTrxReport({ ...input(), bytes }), /TRX|XML|UTF-8/);
  for (const value of ["\0", "\u000b", "\u000c", "\u007f", "\uffff"])
    rejected(captures.passed.xml.replace("<StdOut>", "<StdOut>" + value));
});

const syntaxFaults: Array<[string, (xml: string) => string]> = [
  [
    "DOCTYPE",
    (xml) =>
      xml.replace("<TestRun", '<!DOCTYPE TestRun SYSTEM "file:///synthetic-secret"><TestRun'),
  ],
  ["entity declaration", (xml) => xml.replace("<Results>", '<!ENTITY expand "text"><Results>')],
  ["undeclared entity", (xml) => xml.replace("<StdOut>", "<StdOut>&external;")],
  ["unterminated entity", (xml) => xml.replace("<StdOut>", "<StdOut>&amp")],
  ["NUL reference", (xml) => xml.replace("<StdOut>", "<StdOut>&#0;")],
  ["surrogate reference", (xml) => xml.replace("<StdOut>", "<StdOut>&#xD800;")],
  ["out-of-range reference", (xml) => xml.replace("<StdOut>", "<StdOut>&#x110000;")],
  [
    "processing instruction",
    (xml) => xml.replace("<Results>", '<?source href="file:///outside"?><Results>'),
  ],
  ["second XML declaration", (xml) => xml + '<?xml version="1.0"?>'],
  ["wrong XML version", (xml) => xml.replace('version="1.0"', 'version="1.1"')],
  ["wrong encoding", (xml) => xml.replace('encoding="utf-8"', 'encoding="utf-16"')],
  [
    "duplicate attribute",
    (xml) => xml.replace("<TestRun id=", '<TestRun id="11111111-1111-1111-1111-111111111111" id='),
  ],
  ["missing attribute separator", (xml) => xml.replace('name="default" id=', 'name="default"id=')],
  ["unquoted attribute", (xml) => xml.replace('name="default"', "name=default")],
  ["literal less-than in attribute", (xml) => xml.replace('name="default"', 'name="<default"')],
  ["mismatched closing tag", (xml) => xml.replace("</Results>", "</TestDefinitions>")],
  ["partial report", (xml) => xml.slice(0, -20)],
  ["multiple root", (xml) => xml + "<TestRun />"],
  ["trailing text", (xml) => xml + "unexpected"],
  ["character reference before root", (xml) => xml.replace("<TestRun", "&#32;<TestRun")],
  ["character reference after root", (xml) => xml + "&#32;"],
  ["invalid comment", (xml) => xml.replace("<Results>", "<!-- bad -- comment --><Results>")],
  ["CDATA close in ordinary text", (xml) => xml.replace("<StdOut>", "<StdOut>]]>")],
  ["wrong namespace", (xml) => xml.replace("TeamTest/2010", "TeamTest/2099")],
  ["child namespace rebind", (xml) => xml.replace("<Results>", '<Results xmlns="urn:other">')],
  [
    "qualified namespace spoof",
    (xml) => xml.replace("<Results>", '<Results xmlns:x="urn:other" x:unknown="1">'),
  ],
  ["unknown structure", (xml) => xml.replace("<Results>", "<Results><IgnoredResult />")],
  [
    "attachment escape",
    (xml) =>
      xml.replace(
        "</ResultSummary>",
        '<ResultFiles><ResultFile path="../../outside" /></ResultFiles></ResultSummary>',
      ),
  ],
  ["element limit", (xml) => xml.replace("<Results>", "<Results>" + "<x/>".repeat(8200))],
  [
    "depth limit",
    (xml) => xml.replace("<Results>", "<Results>" + "<x>".repeat(20) + "</x>".repeat(20)),
  ],
  [
    "attribute limit",
    (xml) =>
      xml.replace(
        "<Results>",
        `<Results ${Array.from({ length: 40 }, (_, i) => `x${i}="0"`).join(" ")}>`,
      ),
  ],
];
for (const [name, mutate] of syntaxFaults)
  test(`restricted XML rejects ${name}`, () => rejected(mutate(captures.passed.xml)));

test("result, definition and entry joins must be complete and unique", () => {
  const xml = captures.passed.xml;
  const result = xml.match(/<UnitTestResult\b[^>]+\/>/)![0];
  const definition = xml.match(/<UnitTest\b[\s\S]*?<\/UnitTest>/)![0];
  const entry = xml.match(/<TestEntry\b[^>]+\/>/)![0];
  for (const changed of [
    xml.replace(result, result + result),
    xml.replace(definition, definition + definition),
    xml.replace(entry, entry + entry),
    xml.replace(entry, ""),
    xml.replace(definition, ""),
    xml.replace(/<Execution id="[^"]+"/, '<Execution id="00000000-0000-0000-0000-000000000001"'),
    xml.replace(/testName="AddPositive"/, 'testName="different"'),
    xml.replace(
      /<TestEntry testId="[^"]+"/,
      '<TestEntry testId="00000000-0000-0000-0000-000000000001"',
    ),
    xml.replace(/testListId="[^"]+"/, 'testListId="00000000-0000-0000-0000-000000000001"'),
    xml.replace(/testType="[^"]+"/, 'testType="00000000-0000-0000-0000-000000000001"'),
    xml.replace(/<Times\b[^>]+\/>/, "$&$&"),
  ])
    rejected(changed);
});

test("counts reconcile actual entries with only the documented notExecuted-zero quirk", () => {
  const xml = captures.passed.xml;
  assert.equal(parse(xml.replace('notExecuted="0"', 'notExecuted="1"')).tests.length, 4);
  for (const [before, after] of [
    ['total="4"', 'total="3"'],
    ['executed="3"', 'executed="4"'],
    ['passed="3"', 'passed="4"'],
    ['failed="0"', 'failed="1"'],
    ['notExecuted="0"', 'notExecuted="2"'],
    ['error="0"', 'error="1"'],
    ['warning="0"', 'warning="1"'],
    ['pending="0"', 'pending="1"'],
    ['passed="3"', 'passed="03"'],
    ['outcome="Completed"', 'outcome="Failed"'],
    ['outcome="Passed"', 'outcome="Inconclusive"'],
  ])
    rejected(xml.replace(before!, after!));
});

test("every report and test time is inside the exact native command window", () => {
  const xml = captures.passed.xml;
  // Genuine creation/queuing are after start; do not impose the wrong chronology.
  assert.equal(parse(xml).tests.length, 4);
  assert.throws(
    () => parseGraphTrxReport({ ...input(), startedAt: captures.passed.completedAt }),
    /time|window/i,
  );
  assert.throws(
    () => parseGraphTrxReport({ ...input(), completedAt: captures.passed.startedAt }),
    /time|window/i,
  );
  assert.throws(() => parseGraphTrxReport({ ...input(), startedAt: Number.NaN }), /time|window/i);
  for (const changed of [
    xml.replace(/creation="[^"]+"/, 'creation="2020-01-01T00:00:00Z"'),
    xml.replace(/queuing="[^"]+"/, 'queuing="2030-01-01T00:00:00Z"'),
    xml.replace(/startTime="[^"]+"/, 'startTime="2020-01-01T00:00:00Z"'),
    xml.replace(/endTime="[^"]+"/, 'endTime="2030-01-01T00:00:00Z"'),
    xml.replace(/finish="[^"]+"/, 'finish="2026-02-30T00:00:00Z"'),
    xml.replace(/duration="[^"]+"/, 'duration="-00:00:42.0000000"'),
    xml.replace(/duration="[^"]+"/, 'duration="10000.00:00:00"'),
    xml.replace(/finish="[^"]+"/, 'finish="2026-09-27T03:27:03"'),
  ])
    rejected(changed);
});
