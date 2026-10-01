const { app, BrowserWindow } = require("electron");
app.whenReady().then(() => {
  const w = new BrowserWindow({
    width: 1280,
    height: 720,
    useContentSize: true,
    show: true,
    webPreferences: { contextIsolation: true },
  });
  w.loadFile(process.env.PROTO_FILE);
});
app.on("window-all-closed", () => app.quit());
