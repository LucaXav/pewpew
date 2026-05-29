// PewPew — transparent, click-through, always-on-top Asteroids overlay.
// Main process: window creation, click-through wiring, global shortcuts, IPC.
const { app, BrowserWindow, ipcMain, globalShortcut, screen } = require("electron");
const path = require("path");

// Only one overlay at a time. A relaunch no-ops while one is running.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;
let through = false; // click-through state (input falls through to apps behind)

function createWindow() {
  const preload = path.join(__dirname, "preload.js");

  win = new BrowserWindow({
    transparent: true, // let the desktop / your code editor show through
    backgroundColor: "#00000000",
    frame: false, // no title bar / chrome
    alwaysOnTop: true, // float above other apps
    hasShadow: false,
    resizable: true, // drag the edges to resize the play area
    skipTaskbar: false,
    fullscreenable: false,
    webPreferences: {
      preload,
      backgroundThrottling: false, // keep the game running when unfocused
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Float above full-screen apps too, where the platform allows it.
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnAllWorkspaces: true });

  // Cover the working area of the display the window opens on.
  const d = screen.getDisplayMatching(win.getBounds());
  win.setBounds(d.workArea); // workArea excludes the taskbar

  win.loadFile(path.join(__dirname, "renderer", "index.html"));

  win.on("closed", () => {
    win = null;
  });
}

// --- Click-through -----------------------------------------------------------
// forward:true still delivers mouse-move to the page (for hover hit-testing of
// the handle) while clicks pass to the window underneath.
function applyMouse() {
  if (!win) return;
  win.setIgnoreMouseEvents(through, { forward: true });
}

function setThrough(on) {
  through = on;
  applyMouse();
  if (win) win.webContents.send("through", through);
}

function toggleThrough() {
  setThrough(!through);
}

// Try a list of accelerators for one action; use the first that registers
// (register() returns false silently if another app already owns the combo).
// Returns the accelerator that took, or null if none did.
function registerFirst(candidates, fn) {
  for (const accel of candidates) {
    try {
      if (globalShortcut.register(accel, fn)) return accel;
    } catch (e) {
      /* invalid accel string — try next */
    }
  }
  console.warn(`[pewpew] no shortcut available from: ${candidates.join(", ")}`);
  return null;
}

app.whenReady().then(() => {
  createWindow();

  // Each action tries several combos so a conflict with another app doesn't
  // leave it unbound. The on-screen buttons also cover every action, so the
  // app is fully controllable even if every global shortcut fails.
  const bound = {
    through: registerFirst(
      ["CommandOrControl+Shift+O", "CommandOrControl+Alt+O", "Alt+Shift+O", "CommandOrControl+Shift+Space"],
      toggleThrough
    ),
    mode: registerFirst(
      ["CommandOrControl+Shift+G", "CommandOrControl+Alt+G", "Alt+Shift+G"],
      () => win && win.webContents.send("toggle-mode")
    ),
    pause: registerFirst(
      ["CommandOrControl+Shift+P", "CommandOrControl+Alt+P", "Alt+Shift+P"],
      () => win && win.webContents.send("toggle-pause")
    ),
    quit: registerFirst(
      ["CommandOrControl+Shift+Q", "CommandOrControl+Alt+Q", "Alt+Shift+Q", "CommandOrControl+Shift+X"],
      () => app.quit()
    ),
  };

  // Tell the renderer which keys actually bound so the HUD shows real hints.
  win.webContents.once("did-finish-load", () => {
    win.webContents.send("shortcuts", bound);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// --- IPC from renderer -------------------------------------------------------
ipcMain.on("set-through", (_e, on) => setThrough(!!on));

// While click-through, the renderer hit-tests its handle and asks us to make
// just that spot interactive so it can be clicked to come back.
ipcMain.on("set-interactive", (_e, interactive) => {
  if (!win) return;
  if (!through) return; // ignore while already fully interactive
  win.setIgnoreMouseEvents(!interactive, { forward: true });
});

ipcMain.on("quit", () => app.quit());

ipcMain.handle("get-state", () => ({ through }));

app.on("will-quit", () => globalShortcut.unregisterAll());

app.on("window-all-closed", () => app.quit());
