// 每个畸形输入在独立进程里运行，因为 Chromium 的 C++ 解密在某些输入上会直接中止进程。
const { app, safeStorage } = require("electron");
const fs = require("node:fs");
app.setPath("userData", process.env.PROBE_UD);
app.disableHardwareAcceleration();
app.whenReady().then(() => {
  const synthetic = "SYNTHETIC-PROBE-SECRET";
  const good = safeStorage.encryptString(synthetic);
  const cases = {
    good: good,
    tampered: Buffer.concat([good.subarray(0, good.length - 1), Buffer.from([good[good.length - 1] ^ 0xff])]),
    truncated3: good.subarray(0, 3),
    truncated8: good.subarray(0, 8),
    truncated15: good.subarray(0, 15),
    truncatedHalf: good.subarray(0, Math.floor(good.length / 2)),
    prefixOnly: Buffer.from("v10", "latin1"),
    garbage: Buffer.from("not-a-ciphertext"),
    empty: Buffer.alloc(0),
    legacyFormat: Buffer.from("enc:v1:aaa.bbb.ccc"),
    wrongPrefixSameLength: Buffer.concat([Buffer.from("v99"), good.subarray(3)]),
  };
  const buf = cases[process.env.PROBE_CASE];
  fs.writeFileSync(process.env.PROBE_OUT, JSON.stringify({ case: process.env.PROBE_CASE, started: true }));
  let r;
  try { const v = safeStorage.decryptString(buf); r = { case: process.env.PROBE_CASE, result: v === synthetic ? "decrypted-ok" : "returned length " + v.length }; } catch (e) { r = { case: process.env.PROBE_CASE, result: "throws", message: String(e.message).slice(0, 100) }; }
  fs.writeFileSync(process.env.PROBE_OUT, JSON.stringify(r));
  app.quit();
});
