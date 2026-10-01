// 第二个 userData（= 另一个 OS-crypt 密钥）尝试解密第一个 userData 产生的密文
const { app, safeStorage } = require("electron");
const fs = require("node:fs");
app.setPath("userData", process.env.PROBE_UD2);
app.disableHardwareAcceleration();
app.whenReady().then(() => {
  const r = { availableBeforeUse: safeStorage.isEncryptionAvailable() };
  const blob = fs.readFileSync(process.env.PROBE_BLOB);
  try { const v = safeStorage.decryptString(blob); r.decryptWithOtherUserData = v === fs.readFileSync(process.env.PROBE_SYNTH, "utf8") ? "DECRYPTED (same key!)" : "wrong value"; } catch (e) { r.decryptWithOtherUserData = "throws: " + String(e.message).slice(0, 100); }
  // 第二份 userData 自己能否 round trip
  try { const b = safeStorage.encryptString("x"); r.ownRoundTrip = safeStorage.decryptString(b) === "x"; } catch (e) { r.ownRoundTrip = "throws"; }
  fs.writeFileSync(process.env.PROBE_OUT2, JSON.stringify(r, null, 2));
  app.quit();
});
