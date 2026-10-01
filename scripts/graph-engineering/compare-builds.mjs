import { createReadStream } from "node:fs";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { hashTree, listFiles } from "./release-manifest.mjs";

/**
 * 两次构建的并排比较（Z8.1 §5）。只度量、不断言可复现：列出安装包与组件哈希是否相同，
 * 逐个列出不同的文件，对 app.asar 展开到成员级别，并给出每个差异的内容证据。
 * 解释由人对照这些证据写入报告；本工具不改写打包工具链来消除预期差异。
 */
const root = path.resolve(import.meta.dirname, "../..");
const [first, second, output] = process.argv.slice(2);
if (!first || !second)
  throw new Error("usage: compare-builds.mjs <dist-dir-a> <dist-dir-b> [output.json]");
const a = path.join(root, "packages/desktop", first);
const b = path.join(root, "packages/desktop", second);
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));

const isText = (buffer) => !buffer.includes(0);
function lineDifference(left, right, limit = 6) {
  const l = left.toString("utf8").split(/\r?\n/);
  const r = right.toString("utf8").split(/\r?\n/);
  const rows = [];
  for (let i = 0; i < Math.max(l.length, r.length) && rows.length < limit; i++)
    if (l[i] !== r[i])
      rows.push({ line: i + 1, a: (l[i] ?? "").slice(0, 160), b: (r[i] ?? "").slice(0, 160) });
  return rows;
}

/** 同长度二进制文件：流式比较，报告不同字节的数量与范围（分布方式是解释差异的证据）。 */
async function byteDifference(fileA, fileB) {
  const ia = createReadStream(fileA, { highWaterMark: 1 << 22 })[Symbol.asyncIterator]();
  const ib = createReadStream(fileB, { highWaterMark: 1 << 22 })[Symbol.asyncIterator]();
  let offset = 0;
  let differing = 0;
  let first;
  let last;
  const runs = [];
  for (;;) {
    const [ra, rb] = await Promise.all([ia.next(), ib.next()]);
    if (ra.done || rb.done) break;
    const x = ra.value;
    const y = rb.value;
    for (let i = 0; i < Math.min(x.length, y.length); i++)
      if (x[i] !== y[i]) {
        differing++;
        first ??= offset + i;
        last = offset + i;
        const run = runs.at(-1);
        if (run && offset + i - run.end <= 16) run.end = offset + i;
        else if (runs.length < 50) runs.push({ start: offset + i, end: offset + i });
      }
    offset += x.length;
  }
  return {
    differingBytes: differing,
    firstOffset: first,
    lastOffset: last,
    clusters: runs.length,
    clusterRanges: runs.slice(0, 12),
  };
}

// 把构建标识类差异归一化后再比较：chunk 文件名哈希与 ISO 时间戳。
const normalize = (text) =>
  text
    .replace(/chunk-[A-Z0-9]{8}/g, "chunk-X")
    .replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d+Z/g, "T");

async function compareTrees(label, rootA, rootB) {
  const filesA = await listFiles(rootA);
  const filesB = await listFiles(rootB);
  const treeA = await hashTree(rootA, filesA);
  const treeB = await hashTree(rootB, filesB);
  const onlyA = filesA.filter((f) => !treeB.files[f]);
  const onlyB = filesB.filter((f) => !treeA.files[f]);
  const different = filesA.filter(
    (f) => treeB.files[f] && treeB.files[f].sha256 !== treeA.files[f].sha256,
  );
  const details = [];
  for (const file of different) {
    const left = await readFile(path.join(rootA, ...file.split("/")));
    const right = await readFile(path.join(rootB, ...file.split("/")));
    const text = isText(left) && isText(right) && left.length < 4_000_000;
    details.push({
      file,
      bytesA: left.length,
      bytesB: right.length,
      ...(text
        ? {
            textDifference: lineDifference(left, right),
            identicalAfterNormalizingChunkNamesAndTimestamps:
              normalize(left.toString("utf8")) === normalize(right.toString("utf8")),
          }
        : {
            binary: true,
            ...(left.length === right.length
              ? await byteDifference(
                  path.join(rootA, ...file.split("/")),
                  path.join(rootB, ...file.split("/")),
                )
              : {}),
          }),
    });
  }
  // 仅出现在一侧的文件（例如不同哈希名的 chunk）：按归一化后的内容两两配对。
  const normalizedHash = async (root, file) => {
    const buffer = await readFile(path.join(root, ...file.split("/")));
    return isText(buffer) ? normalize(buffer.toString("utf8")) : buffer.toString("base64");
  };
  const pairs = [];
  const remainingB = new Map(
    await Promise.all(onlyB.map(async (f) => [f, await normalizedHash(rootB, f)])),
  );
  for (const f of onlyA) {
    const key = await normalizedHash(rootA, f);
    const match = [...remainingB].find(([, value]) => value === key);
    pairs.push({ a: f, b: match?.[0], identicalAfterNormalizing: Boolean(match) });
    if (match) remainingB.delete(match[0]);
  }
  return {
    label,
    filesA: filesA.length,
    filesB: filesB.length,
    treeDigestA: treeA.digest,
    treeDigestB: treeB.digest,
    identical: !onlyA.length && !onlyB.length && !different.length,
    onlyInA: onlyA,
    onlyInB: onlyB,
    onlyInOneSidePairing: pairs,
    differentFiles: details,
  };
}

const manifestA = await readJson(path.join(a, "RELEASE_MANIFEST.json"));
const manifestB = await readJson(path.join(b, "RELEASE_MANIFEST.json"));
const unpacked = await compareTrees(
  "win-unpacked",
  path.join(a, "win-unpacked"),
  path.join(b, "win-unpacked"),
);

// app.asar 的成员级比较：把两个归档展开到临时目录。
const asar = createRequire(path.join(root, "packages/desktop/package.json"))("@electron/asar");
const scratch = await mkdtemp(path.join(tmpdir(), "compare-builds-"));
let asarComparison;
try {
  asar.extractAll(path.join(a, "win-unpacked/resources/app.asar"), path.join(scratch, "a"));
  asar.extractAll(path.join(b, "win-unpacked/resources/app.asar"), path.join(scratch, "b"));
  asarComparison = await compareTrees(
    "app.asar members",
    path.join(scratch, "a"),
    path.join(scratch, "b"),
  );
} finally {
  await rm(scratch, { recursive: true, force: true });
}

const component = (key) => ({
  a: manifestA.artifact.components[key]?.sha256 ?? manifestA.artifact.components[key]?.treeDigest,
  b: manifestB.artifact.components[key]?.sha256 ?? manifestB.artifact.components[key]?.treeDigest,
});
const components = Object.fromEntries(
  Object.keys(manifestA.artifact.components).map((key) => {
    const { a: x, b: y } = component(key);
    return [key, { equal: x === y, a: x, b: y }];
  }),
);
const result = {
  schema: "zcode-graph-build-comparison/1",
  sameSourceCommit: manifestA.source.commit === manifestB.source.commit,
  sourceCommit: manifestA.source.commit,
  sourceDirtyAtStart: [manifestA.source.dirty, manifestB.source.dirty],
  sameLockfiles: JSON.stringify(manifestA.lockfiles) === JSON.stringify(manifestB.lockfiles),
  sameToolchain: JSON.stringify(manifestA.toolchain) === JSON.stringify(manifestB.toolchain),
  sameBuildEnvironment:
    JSON.stringify({ ...manifestA.build.environment, ZCODE_DESKTOP_DIST_DIR: 0 }) ===
    JSON.stringify({ ...manifestB.build.environment, ZCODE_DESKTOP_DIST_DIR: 0 }),
  installer: {
    a: manifestA.artifact.installer,
    b: manifestB.artifact.installer,
    byteForByteIdentical:
      manifestA.artifact.installer.sha256 === manifestB.artifact.installer.sha256,
  },
  components,
  unpackedTree: unpacked,
  appAsar: asarComparison,
  note: "Measurements only. No claim of reproducibility is made unless every row is identical; differences are explained in the Z8.1 report with this evidence.",
};
const text = `${JSON.stringify(result, null, 2)}\n`;
if (output) await writeFile(output, text);
else process.stdout.write(text);
