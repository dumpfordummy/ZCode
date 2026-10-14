import { createHash } from "node:crypto";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

export interface BoundedTreeLimits {
  files: number;
  bytes: number;
  fileBytes: number;
  depth: number;
  elapsedMs: number;
}
export interface BoundedTreeRoot {
  path: string;
  label: string;
  exclude?: readonly string[];
}
const same = (a: string, b: string) =>
  process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
/** Exact-root byte observation only: no process, persistence or input-completeness authority. */
export async function fingerprintBoundedTrees(input: {
  roots: readonly BoundedTreeRoot[];
  limits: BoundedTreeLimits;
  signal?: AbortSignal;
}): Promise<{ digest: string; files: number; bytes: number }> {
  const { roots, limits, signal } = input;
  if (
    !roots.length ||
    roots.length > 128 ||
    new Set(roots.map((r) => r.label)).size !== roots.length ||
    roots.some(
      (r) =>
        !isAbsolute(r.path) ||
        !r.label ||
        r.label.length > 4096 ||
        (r.exclude &&
          (r.exclude.length > 32 ||
            r.exclude.some(
              (p) =>
                !p ||
                p.includes("\\") ||
                p.includes(":") ||
                p.split("/").some((s) => !s || s === "." || s === ".."),
            ))),
    ) ||
    Object.values(limits).some((n) => !Number.isSafeInteger(n) || n <= 0) ||
    limits.files > 50000 ||
    limits.bytes > 2 * 1024 * 1024 * 1024 ||
    limits.fileBytes > 256 * 1024 * 1024 ||
    limits.depth > 32 ||
    limits.elapsedMs > 120000
  )
    throw Error("Invalid bounded provenance roots or limits.");
  const deadline = performance.now() + limits.elapsedMs;
  const digest = createHash("sha256");
  let files = 0,
    bytes = 0,
    entries = 0;
  const check = () => {
    signal?.throwIfAborted();
    if (performance.now() > deadline) throw Error("Provenance observation expired.");
  };
  const visit = async (
    path: string,
    label: string,
    depth: number,
    excluded: ReadonlySet<string>,
  ): Promise<void> => {
    check();
    if (++entries > 200000) throw Error("Provenance total entry limit exceeded.");
    if (depth > limits.depth) throw Error("Provenance depth limit exceeded.");
    const before = await lstat(path);
    if (before.isSymbolicLink() || !same(await realpath(path), resolve(path)))
      throw Error("Provenance links/reparse aliases are unsupported.");
    if (before.isDirectory()) {
      const names = (await readdir(path))
        .filter((name) => !excluded.has(resolve(path, name).toLowerCase()))
        .sort();
      if (names.length > limits.files) throw Error("Provenance directory entry limit exceeded.");
      digest.update(JSON.stringify([label, names]));
      for (const name of names)
        await visit(join(path, name), `${label}/${name}`, depth + 1, excluded);
      const after = await lstat(path);
      if (
        before.ino !== after.ino ||
        before.dev !== after.dev ||
        before.mtimeMs !== after.mtimeMs ||
        !same(await realpath(path), resolve(path)) ||
        JSON.stringify(
          (await readdir(path))
            .filter((name) => !excluded.has(resolve(path, name).toLowerCase()))
            .sort(),
        ) !== JSON.stringify(names)
      )
        throw Error("Provenance membership changed during observation.");
      return;
    }
    if (
      !before.isFile() ||
      ++files > limits.files ||
      before.size > limits.fileBytes ||
      (bytes += before.size) > limits.bytes
    )
      throw Error("Provenance file/byte limit exceeded.");
    const handle = await open(path, "r");
    const content = createHash("sha256");
    try {
      const opened = await handle.stat();
      if (opened.ino !== before.ino || opened.dev !== before.dev)
        throw Error("Provenance file identity changed.");
      let count = 0;
      for await (const chunk of handle.createReadStream({ autoClose: false })) {
        check();
        count += chunk.length;
        if (count > before.size) throw Error("Provenance file grew during observation.");
        content.update(chunk);
      }
      const final = await handle.stat(),
        after = await lstat(path);
      if (
        count !== before.size ||
        final.size !== before.size ||
        final.mtimeMs !== before.mtimeMs ||
        final.ctimeMs !== before.ctimeMs ||
        after.ino !== before.ino ||
        after.dev !== before.dev ||
        after.mtimeMs !== before.mtimeMs ||
        after.ctimeMs !== before.ctimeMs ||
        !same(await realpath(path), resolve(path))
      )
        throw Error("Provenance bytes changed during observation.");
      digest.update(JSON.stringify([label, count, content.digest("hex")]));
    } finally {
      await handle.close();
    }
  };
  for (const root of roots)
    await visit(
      root.path,
      root.label,
      0,
      new Set((root.exclude ?? []).map((p) => resolve(root.path, p).toLowerCase())),
    );
  check();
  return { digest: digest.digest("hex"), files, bytes };
}
