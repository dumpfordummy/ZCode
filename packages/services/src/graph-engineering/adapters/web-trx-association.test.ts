import assert from "node:assert/strict";
import test from "node:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { GraphSourceScope } from "../domain/project-budgets.js";
import { associatedBuildPaths } from "../app/web-content-evidence.js";
import { trxEvidenceFixture } from "./trx-evidence.fixture.js";
test("v3 copied Content is bound through genuine TRX normalization; mutation during capture cannot be accepted", async (t) => {
  for (const mutate of [false, true]) {
    const f = await trxEvidenceFixture(t);
    // Unit-injected scope and native observations: no execution or complete-profile claim.
    const scope = {
      version: 3,
      copiedContent: [{ source: "appsettings.json", output: "bin/appsettings.json" }],
    } as GraphSourceScope;
    f.build.recipe.sourceScope = scope;
    f.check.recipe.sourceScope = scope;
    await writeFile(join(f.target.workspacePath, "appsettings.json"), "same bytes");
    await writeFile(join(f.target.workspacePath, "bin/appsettings.json"), "same bytes");
    f.build.outputDigest = (
      await f.options.recipes!.fingerprint(f.target, associatedBuildPaths(f.build.recipe))
    ).digest;
    await f.prepare();
    const capture = f.options.reports!.captureTrx;
    f.options.reports!.captureTrx = async (...args) => {
      const result = await capture(...args);
      if (mutate)
        await writeFile(
          join(f.target.workspacePath, "bin/appsettings.json"),
          "changed during capture",
        );
      return result;
    };
    await f.finish();
    assert.equal(f.check.verification?.acceptancePassed, !mutate);
    assert.equal(f.check.verification?.observationValid === true, !mutate);
    if (!mutate) assert.ok(f.check.normalizationReceiptId);
    else assert.match(f.check.message ?? "", /Copied Web Content|Build outputs changed/);
  }
});
