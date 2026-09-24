import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { acceptancePaths } from "./acceptance-paths.mjs";
import { createGraphProfile } from "../../packages/desktop/scripts/graph-profile.mjs";
import { packagedCases } from "./packaged-cases.mjs";

test("native acceptance uses source paths only for development profiles", () => {
  const home = path.resolve("synthetic-profile");
  const paths = acceptancePaths({ home, workspace: path.join(home, "workspace") });
  assert.equal(paths.ledger, path.join(home, "home/.zcode/cli/db/db.sqlite"));
  assert.equal(path.dirname(paths.record), path.join(home, "data/.zcode/v2/graph-engineering"));
});

test("packaged acceptance reads its own private Graph home and metadata", () => {
  const home = path.resolve("synthetic-packaged-profile");
  const graphProfile = createGraphProfile(path.join(home, "home"));
  const paths = acceptancePaths({ home, workspace: path.join(home, "workspace"), graphProfile });
  assert.equal(paths.ledger, path.join(graphProfile.env.HOME, ".zcode/cli/db/db.sqlite"));
  assert.equal(
    path.dirname(paths.record),
    path.join(graphProfile.env.ZCODE_DATA_BASE_DIR, ".zcode/v2/graph-engineering"),
  );
  assert.ok(paths.record.startsWith(home + path.sep));
  assert.ok(paths.ledger.startsWith(home + path.sep));
});

test("packaged matrix retains Chat/Z1 and covers Z2 completion, interactions and recovery", () => {
  assert.ok(packagedCases.some((item) => item.script === "z2-z1-regression.mjs"));
  assert.ok(packagedCases.some((item) => item.args.includes("--chat")));
  assert.ok(packagedCases.some((item) => item.args.includes("--no-provider")));
  for (const scenario of [
    "complete",
    "question",
    "cancel-question",
    "cancel-permission",
    "cancel-progress",
    "restart-interrupted",
    "restart-permission",
    "persistence-recovery",
  ])
    assert.ok(
      packagedCases.some((item) => item.args.includes(`--scenario=${scenario}`)),
      scenario,
    );
  assert.equal(new Set(packagedCases.map((item) => item.name)).size, packagedCases.length);
});
