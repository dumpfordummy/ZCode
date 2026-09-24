import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { publishGraph } from "./publish-core.mjs";

test("real synthetic Git dry-run captures committed HEAD and refuses untracked source", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "zcode-publish-test-"));
  const home = path.join(root, "home");
  const cwd = path.join(root, "repository");
  await mkdir(home);
  await mkdir(cwd);
  const env = {
    ...Object.fromEntries(
      ["SystemRoot", "WINDIR", "ComSpec", "PATHEXT", "PATH", "TEMP", "TMP"].flatMap((key) =>
        process.env[key] ? [[key, process.env[key]]] : [],
      ),
    ),
    HOME: home,
    USERPROFILE: home,
    APPDATA: home,
    LOCALAPPDATA: home,
    GIT_CONFIG_GLOBAL: path.join(home, "empty-gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
  };
  await writeFile(env.GIT_CONFIG_GLOBAL, "");
  const exec = async (command, args) => {
    assert.equal(command, "git", "dry-run must not call gh or read authentication");
    assert.ok(!["push", "ls-remote"].includes(args[0]), "dry-run must not contact the remote");
    return (
      await promisify(execFile)(command, args, { cwd, env, windowsHide: true, encoding: "utf8" })
    ).stdout;
  };
  await exec("git", ["-c", "init.templateDir=", "init", "--quiet"]);
  await exec("git", ["remote", "add", "origin", "https://github.com/dumpfordummy/ZCode.git"]);
  await writeFile(path.join(cwd, "fixture.txt"), "Synthetic release source\n");
  await exec("git", ["add", "fixture.txt"]);
  await exec("git", [
    "-c",
    "user.name=Synthetic Test",
    "-c",
    "user.email=fixture@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "--quiet",
    "-m",
    "fixture",
  ]);
  const deps = { exec, now: Date.now, sleep: async () => assert.fail("offline"), log: () => {} };
  const options = { version: "3.14.0-z2.1", dryRun: true, resume: false, timeoutMinutes: 1 };
  const result = await publishGraph(options, deps);
  assert.equal(result.commit, (await exec("git", ["rev-parse", "HEAD"])).trim());
  assert.equal((await exec("git", ["tag", "--list"])).trim(), "");
  await writeFile(path.join(cwd, "unreviewed.txt"), "uncommitted\n");
  await assert.rejects(publishGraph(options, deps), /uncommitted/);
  await exec("git", [
    "remote",
    "set-url",
    "--push",
    "origin",
    "https://github.com/other/repository.git",
  ]);
  await exec("git", ["add", "unreviewed.txt"]);
  await exec("git", [
    "-c",
    "user.name=Synthetic Test",
    "-c",
    "user.email=fixture@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "--quiet",
    "-m",
    "second fixture",
  ]);
  await assert.rejects(publishGraph(options, deps), /origin/);
});
