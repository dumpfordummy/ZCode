const { app, session, utilityProcess } = require("electron");
const childProcess = require("node:child_process");
const { syncBuiltinESMExports } = require("node:module");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const originalSpawn = childProcess.spawn;
const originalFork = utilityProcess.fork;
utilityProcess.fork = function (modulePath, args, options) {
  const child = originalFork.call(this, modulePath, args, { ...options, stdio: "pipe" });
  child.stdout?.on("data", (data) => process.stdout.write("[Z1 child] " + data.toString()));
  child.stderr?.on("data", (data) => process.stderr.write("[Z1 child] " + data.toString()));
  return child;
};
app.setAsDefaultProtocolClient = () => {
  console.log("[Z1 isolation] blocked protocol registration");
  return false;
};
app.clearRecentDocuments = () => console.log("[Z1 isolation] blocked recent-document mutation");
childProcess.spawn = function (command, ...args) {
  if (path.basename(String(command)).toLowerCase() === "reg.exe") {
    throw new Error("[Z1 isolation] registry access blocked");
  }
  return originalSpawn.call(this, command, ...args);
};
syncBuiltinESMExports();
const desktopRoot = path.resolve(__dirname, "../../packages/desktop");
app.getAppPath = () => desktopRoot;
app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = new URL(details.url);
    callback({
      cancel:
        process.env.Z1_ALLOW_PROVIDER_NETWORK !== "1" &&
        ["http:", "https:", "ws:", "wss:"].includes(url.protocol) &&
        !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    });
  });
});
import(pathToFileURL(path.join(desktopRoot, "out/main/index.js")).href);
