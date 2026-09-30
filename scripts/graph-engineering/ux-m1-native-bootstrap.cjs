// UX-M1.4 原生验收的可选启动包装：仅在测试进程内给 Chromium 追加设备缩放开关，
// 用来模拟 Windows 125%/150% 显示缩放对渲染的影响；不改变用户的系统显示设置，
// 也不改变应用行为。其余隔离（协议注册、reg.exe、对话框控制）全部沿用 native-bootstrap.cjs。
const { app } = require("electron");
const scale = process.env.UX_M1_DEVICE_SCALE_FACTOR;
if (scale && Number.isFinite(Number(scale)) && Number(scale) > 0) {
  app.commandLine.appendSwitch("force-device-scale-factor", String(scale));
}
require("./native-bootstrap.cjs");
