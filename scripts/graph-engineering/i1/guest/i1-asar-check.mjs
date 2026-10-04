// Z8.4-I1: read-only ASAR integrity record + Electron fuse check of an INSTALLED copy. Node built-ins only, so it can run
// in the disposable guest without the repository's node_modules.
// The header hash is the SHA-256 of the raw header JSON string inside app.asar (same definition as
// packages/desktop/scripts/windows-asar-integrity.mjs and Electron's validator); the record is the ELECTRONASAR resource
// JSON embedded in the exe; the fuse wire is read with the same sentinel/version rules.
//   node i1-asar-check.mjs <install-dir>
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const dir = process.argv[2];
if (!dir) throw new Error("usage: i1-asar-check.mjs <install-dir>");
const FUSE_NAMES = [
  "RunAsNode",
  "EnableCookieEncryption",
  "EnableNodeOptionsEnvironmentVariable",
  "EnableNodeCliInspectArguments",
  "EnableEmbeddedAsarIntegrityValidation",
  "OnlyLoadAppFromAsar",
  "LoadBrowserProcessSpecificV8Snapshot",
  "GrantFileProtocolExtraPrivileges",
];
const SENTINEL = Buffer.from("dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX");

const exe = await readFile(path.join(dir, "ZCode Graph.exe"));
const asar = await readFile(path.join(dir, "resources", "app.asar"));
// Chromium pickle: [u32 4][u32 headerPickleSize][u32 payloadSize][u32 jsonLength][json bytes...]
const jsonLength = asar.readUInt32LE(12);
const headerString = asar.subarray(16, 16 + jsonLength).toString("utf8");
const headerHash = createHash("sha256").update(headerString).digest("hex");

const marker = Buffer.from('[{"file":"resources\\\\app.asar"');
const at = exe.indexOf(marker);
let record;
if (at !== -1) {
  const text = exe.subarray(at, exe.indexOf(Buffer.from("]"), at) + 1).toString("latin1");
  try {
    record = JSON.parse(text);
  } catch {
    record = { unparsed: text };
  }
}

const first = exe.indexOf(SENTINEL);
let fuses;
if (first !== -1) {
  const start = first + SENTINEL.length;
  const length = exe[start + 1];
  const states = [...exe.subarray(start + 2, start + 2 + length)].map((byte) =>
    String.fromCharCode(byte),
  );
  fuses = {
    version: exe[start],
    unique: exe.lastIndexOf(SENTINEL) === first,
    byName: Object.fromEntries(states.map((s, i) => [FUSE_NAMES[i] ?? `fuse${i}`, s])),
  };
}
const recorded = Array.isArray(record)
  ? record.find((r) => r.file === "resources\\app.asar")
  : undefined;
console.log(
  JSON.stringify(
    {
      headerJsonBytes: jsonLength,
      headerSha256: headerHash,
      recordedFile: recorded?.file,
      recordedAlg: recorded?.alg,
      recordedValue: recorded?.value,
      recordMatchesHeader: recorded?.value === headerHash,
      integrityFuse: fuses?.byName.EnableEmbeddedAsarIntegrityValidation,
      fuses,
    },
    null,
    2,
  ),
);
