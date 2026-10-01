import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * 把保留下来的两次构建比较数据（compare-builds.mjs 的输出）换算成互不重叠的账目。
 * 不重新比较任何构建。原始字节比较与归一化后的诊断比较分开列出；
 * 归一化只说明「差异仅限于 chunk 文件名哈希与 ISO 时间戳」，不是字节可复现，也不是行为等价。
 */
export function reconcileTree(tree) {
  const onlyInA = tree.onlyInA.length;
  const onlyInB = tree.onlyInB.length;
  const pathsInBoth = tree.filesA - onlyInA;
  if (pathsInBoth !== tree.filesB - onlyInB)
    throw new Error(`${tree.label}: path counts do not reconcile`);
  const changedSamePath = tree.differentFiles.length;
  const byteIdenticalSamePath = pathsInBoth - changedSamePath;
  if (byteIdenticalSamePath + changedSamePath + onlyInA !== tree.filesA)
    throw new Error(`${tree.label}: accounting for build A does not sum`);
  if (byteIdenticalSamePath + changedSamePath + onlyInB !== tree.filesB)
    throw new Error(`${tree.label}: accounting for build B does not sum`);
  const pairs = tree.onlyInOneSidePairing ?? [];
  return {
    label: tree.label,
    membersInA: tree.filesA,
    membersInB: tree.filesB,
    pathsPresentInBoth: pathsInBoth,
    byteIdenticalSamePath,
    changedSamePath,
    pathsOnlyInA: onlyInA,
    pathsOnlyInB: onlyInB,
    sumCheck: {
      A: `${byteIdenticalSamePath} + ${changedSamePath} + ${onlyInA} = ${tree.filesA}`,
      B: `${byteIdenticalSamePath} + ${changedSamePath} + ${onlyInB} = ${tree.filesB}`,
    },
    // 原始（字节）比较到此为止；以下是单独的、诊断性的归一化比较。
    normalizedDiagnostic: {
      changedSamePathIdenticalAfterNormalizing: tree.differentFiles.filter(
        (file) => file.identicalAfterNormalizingChunkNamesAndTimestamps === true,
      ).length,
      changedSamePathTotal: changedSamePath,
      onlyInOneSidePairsIdenticalAfterNormalizing: pairs.filter(
        (pair) => pair.identicalAfterNormalizing,
      ).length,
      onlyInOneSidePairsTotal: pairs.length,
      meaning:
        "After replacing chunk-XXXXXXXX file-name tokens and ISO timestamps with placeholders, the compared text is equal. This localizes the differences; it is not byte reproducibility and not a behavioral-equivalence claim.",
    },
  };
}

export function reconcileComparison(comparison) {
  return {
    schema: "zcode-graph-comparison-accounting/1",
    sourceCommit: comparison.sourceCommit,
    inputs: {
      sameSourceCommit: comparison.sameSourceCommit,
      sameLockfiles: comparison.sameLockfiles,
      sameToolchain: comparison.sameToolchain,
      sameBuildEnvironment: comparison.sameBuildEnvironment,
    },
    installerByteIdentical: comparison.installer.byteForByteIdentical,
    winUnpacked: reconcileTree(comparison.unpackedTree),
    appAsar: reconcileTree(comparison.appAsar),
    rawByteDifferences: comparison.unpackedTree.differentFiles.map((file) => ({
      file: file.file,
      sameSize: file.bytesA === file.bytesB,
      differingBytes: file.differingBytes,
      clusters: file.clusters,
    })),
    overlapNotes: [
      'pathsPresentInBoth = byteIdenticalSamePath + changedSamePath. The earlier report line "27,562 byte-identical" used pathsPresentInBoth by mistake; byte-identical same-path members are pathsPresentInBoth minus changedSamePath.',
      "The renamed chunk files are pathsOnlyInA/pathsOnlyInB. They are members of the 27,573 in each build but not of pathsPresentInBoth, so they are not counted among the changed same-path members.",
      "The changed same-path members and the renamed chunks are disjoint sets.",
    ],
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const [input, output] = process.argv.slice(2);
  if (!input)
    throw new Error("usage: reconcile-comparison.mjs <build-comparison.json> [output.json]");
  const text = `${JSON.stringify(reconcileComparison(JSON.parse(await readFile(input, "utf8"))), null, 2)}\n`;
  if (output) await writeFile(output, text);
  else process.stdout.write(text);
}
