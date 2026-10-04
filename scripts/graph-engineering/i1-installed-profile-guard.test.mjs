// Z8.4-I1: the installed-profile mode lets the harness drive an installed app on the real default profile, so it must be
// impossible to enable on a machine that is not the disposable Windows Sandbox guest.
import assert from "node:assert/strict";
import test from "node:test";
import { createIsolation } from "./isolation.mjs";

async function withEnv(values, run) {
  const saved = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("installed-profile mode is refused for any user other than the Sandbox guest account", async () => {
  await withEnv(
    {
      Z1_INSTALLED_PROFILE: "1",
      Z1_PACKAGED_EXE: process.execPath,
      USERNAME: "some-host-user",
    },
    () => assert.rejects(createIsolation(), /only allowed .* disposable Windows Sandbox guest/),
  );
});

test("installed-profile mode is refused without a packaged executable", async () => {
  await withEnv(
    { Z1_INSTALLED_PROFILE: "1", Z1_PACKAGED_EXE: undefined, USERNAME: "WDAGUtilityAccount" },
    () => assert.rejects(createIsolation(), /only allowed .* disposable Windows Sandbox guest/),
  );
});
