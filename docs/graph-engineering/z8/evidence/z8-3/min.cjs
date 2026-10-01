const { app, safeStorage } = require("electron");
const fs = require("node:fs");
console.log("userData env", process.env.PROBE_UD);
app.setPath("userData", process.env.PROBE_UD);
app.whenReady().then(() => { fs.writeFileSync(process.env.PROBE_OUT, JSON.stringify({ ok: safeStorage.isEncryptionAvailable() })); app.quit(); });
