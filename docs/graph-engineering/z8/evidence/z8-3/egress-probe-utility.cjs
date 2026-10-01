const net = require("node:net");
const r = {};
(async () => {
  const electron = require("electron");
  try { const res = await electron.net.fetch("http://probe-utility-chromium.test/ping"); r.chromiumNetFetch = "status " + res.status; } catch (e) { r.chromiumNetFetch = "error " + String(e.message).slice(0, 60); }
  // Node 栈：目标只用本地直连监听器，绝不访问外部名字
  try { const res = await fetch(`http://127.0.0.1:${process.env.PROBE_DIRECT_PORT}/node-fetch-loopback`); r.nodeFetchLoopback = "status " + res.status; } catch (e) { r.nodeFetchLoopback = "error " + String(e.message).slice(0, 60); }
  // 仅在显式启用 env-proxy 时，才对保留主机名发请求（交给代理，不做本地 DNS）
  if (process.env.NODE_USE_ENV_PROXY === "1") {
    try { const res = await fetch("http://probe-utility-node.test/ping"); r.nodeFetchReservedName = "status " + res.status; } catch (e) { r.nodeFetchReservedName = "error " + String(e.message).slice(0, 60); }
  } else r.nodeFetchReservedName = "not attempted (would resolve locally, i.e. not contained)";
  await new Promise((resolve) => {
    const s = net.connect(Number(process.env.PROBE_DIRECT_PORT), "127.0.0.1", () => { s.end("GET /raw-tcp HTTP/1.0\r\n\r\n"); });
    s.on("data", () => {}); s.on("close", () => { r.rawTcpLoopback = "connected"; resolve(); }); s.on("error", (e) => { r.rawTcpLoopback = "error " + e.message; resolve(); });
  });
  console.log(JSON.stringify(r));
  process.exit(0);
})();
