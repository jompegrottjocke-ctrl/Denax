const { app, BrowserWindow, session, dialog } = require("electron");
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler(
    (_wc, _permission, callback) => callback(false),
  );
  const window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1050,
    minHeight: 750,
    backgroundColor: "#101216",
    icon: require("node:path").join(__dirname, "src", "icon.ico"),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.on("will-prevent-unload", (event) => {
    const response = dialog.showMessageBoxSync(window, {
      type: "question",
      buttons: ["Fortsätt arbeta", "Stäng utan att spara"],
      defaultId: 0,
      cancelId: 0,
      title: "Denax",
      message: "Projektet har osparade ändringar. Vill du stänga?",
    });
    if (response === 1) event.preventDefault();
  });
  window.loadFile("index.html");
});
app.on("window-all-closed", () => app.quit());
