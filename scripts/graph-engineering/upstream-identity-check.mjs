import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { readUpstreamReference } from "./release-manifest.mjs";

/**
 * 可复现的上游内容比较（Z8.1 §1）。只回答三个具体问题，不声称整树相等或上游祖先关系：
 * 1. 上游在 merge-base..固定 SHA 之间改动的每个路径，在 HEAD 是否字节相同；
 * 2. 不相同的路径，HEAD 是否已包含上游的那次改动（三方合并无冲突且结果等于 HEAD）；
 * 3. 相对固定 SHA 的整树摘要：删除/修改/新增的数量。
 */
const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, "../..");
const git = async (args, options = {}) =>
  (await run("git", args, { cwd: root, maxBuffer: 256_000_000, ...options })).stdout;
const blob = async (ref, file) => {
  try {
    return await git(["show", `${ref}:${file}`], { encoding: "buffer" });
  } catch {
    return undefined;
  }
};

export async function compareUpstreamContent(headRef = "HEAD") {
  const reference = await readUpstreamReference(root);
  const pinned = reference.contentReference.sha;
  const head = (await git(["rev-parse", headRef])).trim();
  const mergeBase = (await git(["merge-base", headRef, pinned])).trim();
  const changed = (await git(["diff", "--name-status", "--no-renames", mergeBase, pinned]))
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"));
  const result = {
    identical: 0,
    containsUpstreamChange: [],
    notContained: [],
    deletedUpstreamStillPresent: [],
  };
  const scratch = await mkdtemp(path.join(tmpdir(), "upstream-identity-"));
  try {
    for (const [status, file] of changed) {
      const mine = await blob(headRef, file);
      if (status === "D") {
        if (mine) result.deletedUpstreamStillPresent.push(file);
        else result.identical++;
        continue;
      }
      const theirs = await blob(pinned, file);
      if (mine && theirs && Buffer.compare(mine, theirs) === 0) {
        result.identical++;
        continue;
      }
      if (!mine) {
        result.notContained.push({ file, reason: "absent at HEAD" });
        continue;
      }
      const base = (await blob(mergeBase, file)) ?? Buffer.alloc(0);
      const [a, b, c] = ["head", "base", "upstream"].map((n) => path.join(scratch, n));
      await writeFile(a, mine);
      await writeFile(b, base);
      await writeFile(c, theirs);
      let merged;
      let clean = true;
      try {
        merged = (
          await run("git", ["merge-file", "-p", a, b, c], {
            encoding: "buffer",
            maxBuffer: 256_000_000,
          })
        ).stdout;
      } catch (error) {
        clean = false;
        merged = error.stdout;
      }
      if (clean && merged && Buffer.compare(merged, mine) === 0)
        result.containsUpstreamChange.push(file);
      else
        result.notContained.push({
          file,
          reason: clean ? "upstream change not present" : "three-way conflict",
        });
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
  const wholeTree = (await git(["diff", "--name-status", "--no-renames", pinned, headRef]))
    .split("\n")
    .filter(Boolean)
    .map((line) => line[0]);
  const count = (letter) => wholeTree.filter((x) => x === letter).length;
  return {
    head,
    mergeBase,
    contentReference: { tag: reference.contentReference.tag, sha: pinned },
    headContainsPinnedCommit: await run("git", [
      "merge-base",
      "--is-ancestor",
      pinned,
      headRef,
    ]).then(
      () => true,
      () => false,
    ),
    upstreamChangedPaths: changed.length,
    byteIdentical: result.identical,
    containsUpstreamChange: result.containsUpstreamChange,
    notContained: result.notContained,
    deletedUpstreamStillPresent: result.deletedUpstreamStillPresent,
    wholeTreeVersusPinned: { deleted: count("D"), modified: count("M"), added: count("A") },
    claims:
      "Path-level comparison only. No whole-tree equality and no upstream ancestry is claimed.",
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  // 用法：upstream-identity-check.mjs [输出文件] [提交]；提交缺省为 HEAD（构建时应传入构建源提交）。
  const output = process.argv[2];
  const result = await compareUpstreamContent(process.argv[3] ?? "HEAD");
  const text = `${JSON.stringify(result, null, 2)}\n`;
  if (output) await writeFile(output, text);
  else process.stdout.write(text);
}
