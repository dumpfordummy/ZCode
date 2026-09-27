import test from "node:test";
import assert from "node:assert/strict";
import {
  TRANSFER_BYTE_LIMIT,
  IMPORT_READ_BOUND,
  assertStatUnchanged,
  decodeImportBytes,
} from "../domain/workflow-transfer.js";
import type { TransferStatSnapshot } from "../domain/workflow-transfer.js";

test("transfer bounds match the U5 spec", () => {
  assert.equal(TRANSFER_BYTE_LIMIT, 256_000);
  assert.equal(IMPORT_READ_BOUND, 256_001);
});

test("decodeImportBytes accepts valid UTF-8 JSON", () => {
  const json = '{"format":"zcode-workflow","version":1}';
  const bytes = new TextEncoder().encode(json);
  assert.equal(decodeImportBytes(bytes), json);
});

test("decodeImportBytes accepts exactly 256,000 bytes at the boundary", () => {
  const pad = "a".repeat(255_992);
  const json = `{"x":"${pad}"}`;
  const bytes = new TextEncoder().encode(json);
  assert.equal(bytes.length, 256_000);
  assert.equal(decodeImportBytes(bytes), json);
});

test("decodeImportBytes rejects 256,001 bytes over the transfer limit", () => {
  const pad = "a".repeat(255_993);
  const json = `{"x":"${pad}"}`;
  const bytes = new TextEncoder().encode(json);
  assert.equal(bytes.length, 256_001);
  assert.throws(() => decodeImportBytes(bytes), /256 KB transfer limit/);
});

test("decodeImportBytes rejects invalid UTF-8 byte sequences", () => {
  // 0x80 是孤立的续接字节，fatal 解码器必须抛出而非替换。
  const bytes = new Uint8Array([0x80]);
  assert.throws(() => decodeImportBytes(bytes), /not valid UTF-8/);
});

test("decodeImportBytes rejects blank or whitespace-only content", () => {
  assert.throws(() => decodeImportBytes(new TextEncoder().encode("   \n\t  ")), /blank/);
  assert.throws(() => decodeImportBytes(new Uint8Array(0)), /blank/);
});

test("decodeImportBytes accepts multibyte UTF-8 under the byte limit", () => {
  // 两个 CJK 字符 = 6 字节 > 2 字符，验证字节上限与字符上限分离。
  const json = '{"q":"你好"}';
  const bytes = new TextEncoder().encode(json);
  assert.ok(bytes.length > json.length);
  assert.equal(decodeImportBytes(bytes), json);
});

test("assertStatUnchanged passes when size/mtime/type all match", () => {
  const before: TransferStatSnapshot = { type: "file", size: 100, mtimeMs: 5 };
  const after: TransferStatSnapshot = { type: "file", size: 100, mtimeMs: 5 };
  assertStatUnchanged(before, after);
});

test("assertStatUnchanged throws when size differs", () => {
  const before: TransferStatSnapshot = { type: "file", size: 100, mtimeMs: 5 };
  const after: TransferStatSnapshot = { type: "file", size: 101, mtimeMs: 5 };
  assert.throws(() => assertStatUnchanged(before, after), /changed during read/);
});

test("assertStatUnchanged throws when mtimeMs differs", () => {
  const before: TransferStatSnapshot = { type: "file", size: 100, mtimeMs: 5 };
  const after: TransferStatSnapshot = { type: "file", size: 100, mtimeMs: 6 };
  assert.throws(() => assertStatUnchanged(before, after), /changed during read/);
});

test("assertStatUnchanged throws when type differs", () => {
  const before: TransferStatSnapshot = { type: "file", size: 100, mtimeMs: 5 };
  const after: TransferStatSnapshot = { type: "directory", size: 100, mtimeMs: 5 };
  assert.throws(() => assertStatUnchanged(before, after), /changed during read/);
});

test("assertStatUnchanged throws when after.size is missing mid-read", () => {
  const before: TransferStatSnapshot = { type: "file", size: 100, mtimeMs: 5 };
  const after: TransferStatSnapshot = { type: "file", mtimeMs: 5 };
  assert.throws(() => assertStatUnchanged(before, after), /changed during read/);
});
