// 合成的出站测量可行性探针。所有目标要么是 127.0.0.1，要么是只会交给本地记录代理的保留主机名（.test）；
// 不向外部发送任何东西：Chromium 走 --proxy-server（主机名由代理处理，不做本地 DNS），
// Node 仅在显式 NODE_USE_ENV_PROXY=1 时走代理，且“绕过”用例只访问 127.0.0.1。
const { app, net, BrowserWindow, utilityProcess } = require("electron");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const out = process.env.PROBE_OUT;
const netlog = process.env.PROBE_NETLOG;
const proxyEvents = [];
const directEvents = [];

function listen(handler, onConnect) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    if (onConnect) server.on("connect", onConnect);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

(async () => {
  const proxy = await listen(
    (req, res) => {
      proxyEvents.push({ kind: "http", method: req.method, target: req.url, headerNames: Object.keys(req.headers).sort() });
      res.writeHead(502, { "content-type": "text/plain" });
      res.end("recorded-by-egress-probe");
    },
    (req, socket) => {
      proxyEvents.push({ kind: "connect", target: req.url, headerNames: Object.keys(req.headers).sort() });
      socket.end("HTTP/1.1 502 Bad Gateway\r\nconnection: close\r\n\r\n");
    },
  );
  const direct = await listen((req, res) => {
    directEvents.push({ method: req.method, url: req.url, host: req.headers.host });
    res.end("direct-listener");
  });
  const proxyUrl = `http://127.0.0.1:${proxy.address().port}`;
  const directPort = direct.address().port;
  app.commandLine.appendSwitch("proxy-server", proxyUrl);
  app.commandLine.appendSwitch("proxy-bypass-list", "<-loopback>"); // 不绕过回环；记录一切 Chromium 流量
  app.disableHardwareAcceleration();
  app.setPath("userData", process.env.PROBE_UD);
  await app.whenReady();
  const { netLog } = require("electron");
  await netLog.startLogging(netlog, { captureMode: "default" });
  const results = {};

  // 1) Main 进程 net.fetch（Chromium 栈）
  for (const [name, url] of [["main-net-fetch-http", "http://probe-main.test/ping"], ["main-net-fetch-https", "https://probe-main-tls.test/ping"]]) {
    try { const r = await net.fetch(url); results[name] = "status " + r.status; } catch (e) { results[name] = "error " + String(e.message).slice(0, 80); }
  }
  // 2) 渲染进程 fetch
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  await win.loadURL("data:text/html,<html></html>");
  results.renderer = await win.webContents.executeJavaScript(
    `fetch("http://probe-renderer.test/ping").then(r=>"status "+r.status).catch(e=>"error "+e.message)`,
  );
  // 3) utilityProcess 内：Chromium net.fetch、Node fetch（带/不带 NODE_USE_ENV_PROXY）、Node 原始 TCP
  const runUtility = (label, env) =>
    new Promise((resolve) => {
      const child = utilityProcess.fork(path.join(__dirname, "egress-probe-utility.cjs"), [], {
        env: { ...process.env, PROBE_DIRECT_PORT: String(directPort), PROBE_PROXY_URL: proxyUrl, ...env },
        stdio: "pipe",
      });
      let text = "";
      child.stdout.on("data", (d) => (text += d));
      child.stderr.on("data", (d) => (text += d));
      const timer = setTimeout(() => { child.kill(); resolve({ label, timeout: true, output: text.slice(0, 400) }); }, 20000);
      child.on("exit", () => { clearTimeout(timer); try { resolve({ label, ...JSON.parse(text.trim().split("\n").pop()) }); } catch { resolve({ label, raw: text.slice(0, 400) }); } });
    });
  results.utilityWithoutEnvProxy = await runUtility("without NODE_USE_ENV_PROXY", {});
  results.utilityWithEnvProxy = await runUtility("with NODE_USE_ENV_PROXY=1", {
    NODE_USE_ENV_PROXY: "1", HTTP_PROXY: proxyUrl, HTTPS_PROXY: proxyUrl, NO_PROXY: "",
  });
  await netLog.stopLogging();
  // netlog 里 Chromium 发起的 URL 请求
  let netlogUrls = [];
  try {
    const log = JSON.parse(fs.readFileSync(netlog, "utf8"));
    const urlEvents = new Map();
    for (const ev of log.events || []) {
      const params = ev.params || {};
      if (params.url && /probe-/.test(params.url)) urlEvents.set(params.url, true);
      if (params.host && /probe-/.test(params.host)) urlEvents.set("host:" + params.host, true);
    }
    netlogUrls = [...urlEvents.keys()].sort();
  } catch (e) { netlogUrls = ["netlog unreadable: " + e.message]; }
  fs.writeFileSync(out, JSON.stringify({ electron: process.versions.electron, node: process.versions.node, results, proxyEvents, directEvents, netlogUrls }, null, 2));
  proxy.close(); direct.close(); app.quit();
})().catch((e) => { fs.writeFileSync(out, JSON.stringify({ fatal: String(e.stack || e).slice(0, 500) })); app.quit(); });
