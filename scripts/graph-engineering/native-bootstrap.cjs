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

// U5 受控 Electron 对话框边界（仅测试用，spec 授权的 "controlled Electron seam in
// isolated tests"）。当 ZCODE_GRAPH_DIALOG_CONTROL 指向一个控制 JSON 文件时，覆盖
// dialog.showOpenDialog/showSaveDialog 返回受控 path/cancel/fail；未设置时行为不变。
// 控制文件每次调用重新读取，允许测试在单次会话内逐场景切换 open/save 意图。
// shape: { open?: {path:string}|{cancel:true}|{fail:string}|{pending:true}, save?: same }
// pending: true 使对话框挂起（轮询控制文件），直到测试将其改为 path/cancel/fail。
// 这让异步生命周期测试可以在读取过程中主动卸载组件或切换工作区，再释放对话框解析。
const dialogControlPath = process.env.ZCODE_GRAPH_DIALOG_CONTROL;
if (dialogControlPath) {
  const electronDialog = require("electron").dialog;
  const nodeFs = require("node:fs");
  const readDialogControl = () => {
    try {
      return JSON.parse(nodeFs.readFileSync(dialogControlPath, "utf8")) || {};
    } catch {
      return {};
    }
  };
  const awaitIntent = async (channel) => {
    // 轮询控制文件直到该 channel 出现可解析意图（path/cancel/fail），最多等待 30s。
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const intent = readDialogControl()[channel];
      if (intent?.fail) throw new Error(intent.fail);
      if (intent?.cancel) return intent;
      if (intent?.path) return intent;
      if (!intent?.pending) return undefined; // 无控制 → 回退到原生对话框
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`ZCODE_GRAPH_DIALOG_CONTROL ${channel} pending timeout`);
  };
  const originalShowOpen = electronDialog.showOpenDialog;
  const originalShowSave = electronDialog.showSaveDialog;
  const dialogLog = (msg) => process.stderr.write(`[Z1-DIALOG] ${msg}\n`);
  dialogLog(
    `override applied: showOpenDialog=${typeof originalShowOpen} showSaveDialog=${typeof originalShowSave}`,
  );
  electronDialog.showOpenDialog = async function (...args) {
    const intent = readDialogControl().open;
    dialogLog(`showOpenDialog called, intent=${JSON.stringify(intent)}`);
    if (intent?.pending) {
      const resolved = await awaitIntent("open");
      if (!resolved) return originalShowOpen.apply(electronDialog, args);
      if (resolved.cancel) return { canceled: true, filePaths: [] };
      return { canceled: false, filePaths: [resolved.path] };
    }
    if (intent?.fail) throw new Error(intent.fail);
    if (intent?.cancel) return { canceled: true, filePaths: [] };
    if (intent?.path) return { canceled: false, filePaths: [intent.path] };
    return originalShowOpen.apply(electronDialog, args);
  };
  electronDialog.showSaveDialog = async function (...args) {
    const intent = readDialogControl().save;
    dialogLog(`showSaveDialog called, intent=${JSON.stringify(intent)}`);
    if (intent?.pending) {
      const resolved = await awaitIntent("save");
      if (!resolved) return originalShowSave.apply(electronDialog, args);
      if (resolved.cancel) return { canceled: true, filePath: undefined };
      return { canceled: false, filePath: resolved.path };
    }
    if (intent?.fail) throw new Error(intent.fail);
    if (intent?.cancel) return { canceled: true, filePath: undefined };
    if (intent?.path) return { canceled: false, filePath: intent.path };
    return originalShowSave.apply(electronDialog, args);
  };
}
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
