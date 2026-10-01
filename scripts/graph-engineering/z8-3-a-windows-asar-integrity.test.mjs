import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { NtExecutable, NtExecutableResource } from "resedit";
import {
  assertWindowsAsarIntegrity,
  computeAsarHeaderHash,
  GRAPH_WINDOWS_ELECTRON_FUSES,
  readFuseWire,
  refreshWindowsAsarIntegrity,
  WindowsAsarIntegrityError,
} from "../../packages/desktop/scripts/windows-asar-integrity.mjs";
import {
  builderComputeData,
  flipFuses,
  integrityEntries,
  OBSERVED_STATES,
  PlatformPackager,
  packSyntheticAsar,
  recordOf,
  rejectsWithCode,
  stalePackage,
  summarize,
  syntheticExeWithEntries,
  syntheticPe,
} from "./z8-3-a-synthetic-fixtures.mjs";

/** Z8.3-A：ELECTRONASAR 记录替换与 fuse 读取的测试。夹具均为 SYNTHETIC，见 z8-3-a-synthetic-fixtures.mjs。 */
test("header hash uses the single pinned definition (raw header bytes == asar API == electron-builder)", async (t) => {
  const { appOutDir, asarPath } = await stalePackage(t);
  const bytes = await readFile(asarPath);
  // 独立参照：app.asar 前 8 字节是 size pickle，随后是 header pickle（payload 长度、字符串长度、JSON 字符串）。
  const headerPickleSize = bytes.readUInt32LE(4);
  const jsonLength = bytes.readUInt32LE(12);
  const rawJson = bytes.subarray(16, 16 + jsonLength);
  assert.ok(headerPickleSize >= jsonLength);
  const independent = createHash("sha256").update(rawJson).digest("hex");
  assert.equal(await computeAsarHeaderHash(asarPath), independent);
  const builder = await builderComputeData({
    resourcesPath: path.join(appOutDir, "resources"),
    resourcesRelativePath: "resources",
    resourcesDestinationPath: path.join(appOutDir, "resources"),
    extraResourceMatchers: [],
  });
  assert.equal(builder["resources/app.asar"].hash, independent);
});

test("refresh replaces the stale ELECTRONASAR entry in place instead of appending", async (t) => {
  const { exePath, appOutDir, asarPath } = await stalePackage(t);
  const before = await readFile(exePath);
  assert.equal(integrityEntries(before).length, 1);
  const staleValue = recordOf(before)[0].value;
  assert.notEqual(staleValue, await computeAsarHeaderHash(asarPath), "fixture must start stale");

  const result = await refreshWindowsAsarIntegrity({ exePath, appOutDir });
  assert.equal(result.changed, true);
  const after = await readFile(exePath);
  assert.equal(integrityEntries(after).length, 1, "replaced in place, not appended");
  const record = recordOf(after);
  assert.equal(record.length, 1);
  assert.deepEqual(record[0], {
    file: "resources\\app.asar",
    alg: "SHA256",
    value: await computeAsarHeaderHash(asarPath),
  });
  assert.equal(summarize(after).length, summarize(before).length);

  // 字节级核对：旧的过期值不再出现在文件任何位置，新值恰好出现一次（没有残留的旧记录）。
  const countOccurrences = (haystack, text) => {
    let count = 0;
    for (let at = haystack.indexOf(text); at !== -1; at = haystack.indexOf(text, at + 1))
      count += 1;
    return count;
  };
  assert.equal(countOccurrences(after, `"value":"${staleValue}"`), 0);
  assert.equal(countOccurrences(after, `"value":"${result.hash}"`), 1);
});

test("refresh preserves every unrelated PE resource byte-for-byte, including lang and codepage", async (t) => {
  const { exePath, appOutDir } = await stalePackage(t);
  const before = summarize(await readFile(exePath));
  await refreshWindowsAsarIntegrity({ exePath, appOutDir });
  const after = summarize(await readFile(exePath));
  const unrelated = (list) =>
    list.filter((entry) => !(entry.type === "INTEGRITY" && entry.id === "ELECTRONASAR"));
  assert.deepEqual(unrelated(after), unrelated(before));
  assert.ok(unrelated(after).some((entry) => entry.id === "UNRELATED_A" && entry.lang === 1033));
  assert.ok(
    unrelated(after).some(
      (entry) => entry.type === "CUSTOMTYPE" && entry.lang === 2052 && entry.codepage === 936,
    ),
  );
  // 被替换条目自身的 type/id/lang/codepage 也保持原样
  const [oldEntry] = before.filter((entry) => entry.id === "ELECTRONASAR");
  const [newEntry] = after.filter((entry) => entry.id === "ELECTRONASAR");
  assert.deepEqual(
    { type: newEntry.type, id: newEntry.id, lang: newEntry.lang, codepage: newEntry.codepage },
    { type: oldEntry.type, id: oldEntry.id, lang: oldEntry.lang, codepage: oldEntry.codepage },
  );
});

test("refresh is idempotent: the second run changes nothing and leaves identical bytes", async (t) => {
  const { exePath, appOutDir } = await stalePackage(t);
  const first = await refreshWindowsAsarIntegrity({ exePath, appOutDir });
  const afterFirst = await readFile(exePath);
  const second = await refreshWindowsAsarIntegrity({ exePath, appOutDir });
  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(second.hash, first.hash);
  assert.ok((await readFile(exePath)).equals(afterFirst));
});

test("refresh keeps other record entries and only replaces the app.asar value", async (t) => {
  const { exePath, appOutDir } = await stalePackage(t);
  const other = path.join(appOutDir, "resources", "extra.asar");
  await packSyntheticAsar(path.join(appOutDir, "extra-src"), "extra");
  await writeFile(other, await readFile(path.join(appOutDir, "extra-src/resources/app.asar")));
  const otherHash = await computeAsarHeaderHash(other);
  const executable = NtExecutable.from(await readFile(exePath));
  const resource = NtExecutableResource.from(executable);
  const entry = resource.entries.find((e) => e.id === "ELECTRONASAR");
  const list = JSON.parse(Buffer.from(entry.bin).toString("utf8"));
  list.push({ file: "resources\\extra.asar", alg: "SHA256", value: otherHash });
  const payload = Buffer.from(JSON.stringify(list));
  entry.bin = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength);
  resource.outputResource(executable);
  await writeFile(exePath, Buffer.from(executable.generate()));

  await refreshWindowsAsarIntegrity({ exePath, appOutDir });
  const record = recordOf(await readFile(exePath));
  assert.equal(record.length, 2);
  assert.equal(record.find((r) => r.file.endsWith("extra.asar")).value, otherHash);
  await assertWindowsAsarIntegrity({ exePath, appOutDir, requireFuse: false });
});

test("malformed, missing, duplicate and unsupported state fails clearly and never rewrites the file", async (t) => {
  const { appOutDir } = await stalePackage(t);
  const withEntries = syntheticExeWithEntries;
  const integrity = (text, extra = {}) => ({
    type: "INTEGRITY",
    id: "ELECTRONASAR",
    bin: Buffer.from(text),
    lang: 1033,
    codepage: 1200,
    ...extra,
  });
  const good = (value = "a".repeat(64)) =>
    JSON.stringify([{ file: "resources\\app.asar", alg: "SHA256", value }]);
  const cases = [
    ["resource-missing", withEntries(() => {})],
    [
      "resource-ambiguous",
      withEntries((entries) => entries.push(integrity(good()), integrity(good(), { lang: 2052 }))),
    ],
    ["record-malformed", withEntries((entries) => entries.push(integrity("not json")))],
    ["record-malformed", withEntries((entries) => entries.push(integrity("[]")))],
    ["record-malformed", withEntries((entries) => entries.push(integrity(good("xyz"))))],
    [
      "record-malformed",
      withEntries((entries) =>
        entries.push(
          integrity(
            JSON.stringify([
              { file: "resources\\app.asar", alg: "SHA256", value: "a".repeat(64), extra: 1 },
            ]),
          ),
        ),
      ),
    ],
    [
      "record-unsupported",
      withEntries((entries) =>
        entries.push(
          integrity(
            JSON.stringify([{ file: "resources\\app.asar", alg: "SHA512", value: "a".repeat(64) }]),
          ),
        ),
      ),
    ],
    [
      "record-missing-app-asar",
      withEntries((entries) =>
        entries.push(
          integrity(
            JSON.stringify([
              { file: "resources\\other.asar", alg: "SHA256", value: "a".repeat(64) },
            ]),
          ),
        ),
      ),
    ],
    [
      "record-ambiguous",
      withEntries((entries) =>
        entries.push(
          integrity(
            JSON.stringify([
              { file: "resources\\app.asar", alg: "SHA256", value: "a".repeat(64) },
              { file: "RESOURCES/app.asar", alg: "SHA256", value: "b".repeat(64) },
            ]),
          ),
        ),
      ),
    ],
    ["malformed-pe", Buffer.from("MZ this is not a portable executable")],
    ["malformed-pe", Buffer.alloc(0)],
  ];
  for (const [code, bytes] of cases) {
    const exePath = path.join(appOutDir, `case-${code}.exe`);
    await writeFile(exePath, bytes);
    await rejectsWithCode(refreshWindowsAsarIntegrity({ exePath, appOutDir }), code);
    assert.ok((await readFile(exePath)).equals(bytes), `${code}: file must not be modified`);
  }
  // 已签名 PE：写回会丢弃签名，刷新拒绝；只读断言仍可读取。
  const signedPath = path.join(appOutDir, "signed.exe");
  const signed = syntheticPe({ signed: true });
  await writeFile(signedPath, signed);
  await rejectsWithCode(
    refreshWindowsAsarIntegrity({ exePath: signedPath, appOutDir }),
    "signed-pe",
  );
  assert.ok((await readFile(signedPath)).equals(signed));
  await rejectsWithCode(
    assertWindowsAsarIntegrity({ exePath: signedPath, appOutDir, requireFuse: false }),
    "resource-missing",
  );
  // 归档缺失/损坏
  await rm(path.join(appOutDir, "resources/app.asar"));
  const exePath = path.join(appOutDir, "needs-archive.exe");
  await writeFile(
    exePath,
    withEntries((entries) => entries.push(integrity(good()))),
  );
  await rejectsWithCode(refreshWindowsAsarIntegrity({ exePath, appOutDir }), "archive-unreadable");
});

test("an archive changed after its record was generated is detected, a refreshed one is accepted", async (t) => {
  const { exePath, appOutDir } = await stalePackage(t);
  await rejectsWithCode(
    assertWindowsAsarIntegrity({ exePath, appOutDir, requireFuse: false }),
    "record-stale",
  );
  await refreshWindowsAsarIntegrity({ exePath, appOutDir });
  const ok = await assertWindowsAsarIntegrity({ exePath, appOutDir, requireFuse: false });
  assert.equal(ok.records[0].recorded, ok.records[0].actual);
  // 记录写好之后再改一次归档（例如又一轮 afterPack 重写）：必须被发现。
  await packSyntheticAsar(appOutDir, "changed-after-record");
  await rejectsWithCode(
    assertWindowsAsarIntegrity({ exePath, appOutDir, requireFuse: false }),
    "record-stale",
  );
});

test("fuse flip with the builder's own mapping changes only the integrity fuse; unrelated fuses incl. the unnamed ninth are untouched", async (t) => {
  const { exePath, appOutDir } = await stalePackage(t);
  await refreshWindowsAsarIntegrity({ exePath, appOutDir });
  const before = readFuseWire(await readFile(exePath));
  assert.deepEqual(before.states, OBSERVED_STATES);
  // electron-builder 自己的 generateFuseConfig 把 electronFuses 映射成 @electron/fuses 配置。
  const config = PlatformPackager.prototype.generateFuseConfig.call(
    null,
    GRAPH_WINDOWS_ELECTRON_FUSES,
  );
  assert.deepEqual(
    Object.keys(config).filter((key) => key !== "version" && key !== "resetAdHocDarwinSignature"),
    ["4"],
  );
  await flipFuses(exePath, config);
  const after = readFuseWire(await readFile(exePath));
  const expected = [...OBSERVED_STATES];
  expected[4] = "1";
  assert.deepEqual(after.states, expected);
  assert.equal(after.byName.fuse8, "1", "ninth fuse is neither identified nor changed");
  assert.equal(after.byName.RunAsNode, "1");
  // fuse 翻转后记录仍匹配，且 fuse 已开
  const result = await assertWindowsAsarIntegrity({ exePath, appOutDir, requireFuse: true });
  assert.equal(result.fuses.byName.EnableEmbeddedAsarIntegrityValidation, "1");
});

test("fuse wire reading rejects missing, duplicate, malformed and too-short wires; fuse-off fails the final assertion", async (t) => {
  const reject = (bytes, code) =>
    assert.throws(
      () => readFuseWire(bytes),
      (e) => e.code === code && e instanceof WindowsAsarIntegrityError,
    );
  reject(syntheticPe({ wire: null }), "fuse-missing");
  reject(syntheticPe({ sentinels: 2 }), "fuse-ambiguous");
  reject(syntheticPe({ wireVersion: 2 }), "fuse-malformed");
  reject(syntheticPe({ wire: ["1", "0", "1", "1"] }), "fuse-malformed");
  reject(syntheticPe({ wire: ["1", "0", "1", "1", "x", "0", "0", "1", "1"] }), "fuse-malformed");
  reject(syntheticPe({ wireLength: 200 }), "fuse-malformed");
  const { exePath, appOutDir } = await stalePackage(t);
  await refreshWindowsAsarIntegrity({ exePath, appOutDir });
  await rejectsWithCode(
    assertWindowsAsarIntegrity({ exePath, appOutDir, requireFuse: true }),
    "fuse-off",
  );
  // 状态为 removed ('r') 同样不算打开
  const removed = await stalePackage(t, { wire: ["1", "0", "1", "1", "r", "0", "0", "1", "1"] });
  await refreshWindowsAsarIntegrity({ exePath: removed.exePath, appOutDir: removed.appOutDir });
  await rejectsWithCode(
    assertWindowsAsarIntegrity({
      exePath: removed.exePath,
      appOutDir: removed.appOutDir,
      requireFuse: true,
    }),
    "fuse-off",
  );
});
