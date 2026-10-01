// 合成可行性探针：只使用合成字符串；临时 userData；不读任何真实 profile 或凭据。
const { app, safeStorage, utilityProcess } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const out = process.env.PROBE_OUT;
const ud = process.env.PROBE_UD;
app.setPath("userData", ud);
app.disableHardwareAcceleration();
const result = { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node, platform: process.platform };
app.whenReady().then(async () => { try {
  const synthetic = "SYNTHETIC-PROBE-SECRET-" + Math.random().toString(36).slice(2);
  result.availableBeforeUse = safeStorage.isEncryptionAvailable();
  const blob = safeStorage.encryptString(synthetic);
  result.blobBytes = blob.length;
  result.blobPrefixAscii = blob.subarray(0, 3).toString("latin1");
  result.blobContainsPlain = blob.includes(Buffer.from(synthetic));
  result.roundTrip = safeStorage.decryptString(blob) === synthetic;
  const localState = path.join(ud, "Local State");
  result.localStateExists = fs.existsSync(localState);
  if (result.localStateExists) {
    const ls = JSON.parse(fs.readFileSync(localState, "utf8"));
    const key = ls?.os_crypt?.encrypted_key;
    result.localStateOsCryptKeyPresent = typeof key === "string";
    result.localStateKeyPrefixAfterBase64 = typeof key === "string" ? Buffer.from(key, "base64").subarray(0, 5).toString("latin1") : null;
    result.localStateKeys = Object.keys(ls);
  }
  // 篡改
  const tampered = Buffer.from(blob);
  tampered[tampered.length - 1] ^= 0xff;
  try { safeStorage.decryptString(tampered); result.tamperedDecrypt = "NO ERROR (unexpected)"; } catch (e) { result.tamperedDecrypt = "throws: " + String(e.message).slice(0, 80); }
  // 截断 / 垃圾
  for (const [name, b] of [["garbage", Buffer.from("not-a-ciphertext")], ["empty", Buffer.alloc(0)]]) {
    try { const v = safeStorage.decryptString(b); result[name] = "NO ERROR, returned length " + v.length; } catch (e) { result[name] = "throws: " + String(e.message).slice(0, 80); }
  }
  // 写入第二份 blob 到磁盘供第二个 userData 的进程解密（模拟 profile 被拷到别处）
  fs.writeFileSync(process.env.PROBE_BLOB, blob);
  fs.writeFileSync(process.env.PROBE_SYNTH, synthetic);
  // 任意 plaintext：旧格式字符串的 decryptString 行为
  try { const v = safeStorage.decryptString(Buffer.from("enc:v1:aaa.bbb.ccc")); result.legacyFormatDecrypt = "NO ERROR " + v.length; } catch (e) { result.legacyFormatDecrypt = "throws: " + String(e.message).slice(0, 80); }
  fs.writeFileSync(out, JSON.stringify(result, null, 2));
  if (process.env.PROBE_NO_UTILITY) { app.quit(); return; }
  // utilityProcess 里能不能用 safeStorage
  try {
    const child = utilityProcess.fork(path.join(__dirname, "safe-storage-utility.cjs"), [], { stdio: "pipe" });
    let text = "";
    child.stdout.on("data", (d) => (text += d));
    child.stderr.on("data", (d) => (text += d));
    const exit = await new Promise((resolve) => { child.on("exit", resolve); setTimeout(() => resolve("timeout"), 15000); });
    result.utility = { exit, output: text.trim().slice(0, 400) };
  } catch (e) { result.utility = { error: String(e.message).slice(0, 200) }; }
  fs.writeFileSync(out, JSON.stringify(result, null, 2));
  } catch (e) { result.fatal = String(e && e.stack || e).slice(0, 600); fs.writeFileSync(out, JSON.stringify(result, null, 2)); }
  app.quit();
});
