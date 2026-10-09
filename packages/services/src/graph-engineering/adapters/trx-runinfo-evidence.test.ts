import assert from "node:assert/strict";
import { mkdir, readFile, utimes, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { createGraphReportCapture } from "./trx-capture.js";
import { hash, operation, trxEvidenceFixture } from "./trx-evidence.fixture.js";
import { trxAttemptRecordErrors } from "../domain/trx-receipt.js";

// Portable synthetic owner test: real derived XML/capture/parser; injected native facts.
// Fresh B1 native acceptance separately proves actual process execution.
for (const infrastructureError of [false, true])
  test(
    "derived failed report through real capture and owner; infrastructureError=" +
      infrastructureError,
    async (t) => {
      const f = await trxEvidenceFixture(t);
      const verifier = f.check.recipe.verifier;
      assert.equal(verifier.kind, "test");
      if (verifier.kind !== "test" || verifier.format !== "dotnet-vstest-trx-v1")
        throw new Error("fixture");
      verifier.minimumTests = 3;
      verifier.expectedTests = 3;
      verifier.requiredTests = [];
      f.options.reports = createGraphReportCapture();
      f.options.now = () => 1791208824000;
      f.check.operation = {
        ...operation(f.check, 1),
        startedAt: 1791208822514,
        completedAt: 1791208823453,
      };
      await f.prepare();
      let xml = await readFile(
        new URL("../app/fixtures/b1-xunit-failed-derived.trx", import.meta.url),
        "utf8",
      );
      const assembly = join(f.target.workspacePath, verifier.target.assembly);
      xml = xml
        .replaceAll("C:\\fixture\\workspace\\Tests\\bin\\Debug\\net8.0\\B1.Tests.dll", assembly)
        .replaceAll("c:\\fixture\\workspace\\tests\\bin\\debug\\net8.0\\b1.tests.dll", assembly);
      if (infrastructureError) {
        const info = xml.match(/<RunInfo\b[\s\S]*?<\/RunInfo>/)![0];
        xml = xml.replace(
          "</RunInfos>",
          info.replace(
            /<Text>[\s\S]*?<\/Text>/,
            "<Text>The active test run was aborted. Reason: Test host process crashed</Text>",
          ) + "</RunInfos>",
        );
      }
      const reportPath = join(f.target.workspacePath, f.check.resolvedReportPath!);
      await mkdir(dirname(reportPath), { recursive: true });
      await writeFile(reportPath, xml);
      await utimes(reportPath, 1791208823.42, 1791208823.42);
      await f.finish();
      assert.equal(f.check.status, "Failed");
      assert.equal(f.check.verification?.acceptancePassed, false);
      if (infrastructureError) assert.notEqual(f.check.verification?.observationValid, true);
      else assert.equal(f.check.verification?.observationValid, true);
      if (infrastructureError) {
        assert.equal(f.check.normalizationReceiptId, undefined);
      } else {
        assert.equal(f.check.verification?.outcome, "fail");
        assert.ok(f.check.normalizationReceiptId);
        const receipt = JSON.parse((await f.retained("normalization")).content);
        assert.equal(receipt.original.digest, hash(xml));
        assert.equal(receipt.operationId, f.check.operationId);
        assert.equal(receipt.sourceDigest, f.check.sourceDigest);
        assert.equal(receipt.buildDigest, f.check.buildDigest);
        assert.equal((await f.retained("normalization")).artifact.validation, "valid");
        assert.equal((await f.retained("normalized-report")).artifact.validation, "valid");
        assert.equal((await f.retained("verification")).artifact.validation, "valid");
        assert.deepEqual(trxAttemptRecordErrors(f.run, f.check), []);
        await f.artifacts.binding(
          f.run,
          { kind: "artifact", nodeId: "test", selector: "verification" },
          "failure",
        );
        await f.cold().read(structuredClone(f.run), f.selector("normalization")!);
      }
    },
  );
