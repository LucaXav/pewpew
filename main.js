// PewPew — transparent, click-through, always-on-top Asteroids overlay.
// Main process: window creation, click-through wiring, global shortcuts, IPC.
const { app, BrowserWindow, ipcMain, globalShortcut, screen } = require("electron");
const path = require("path");
const fs = require("fs");

// Only one overlay at a time. If a second copy is launched (e.g. via the
// Ctrl+Shift+F7 desktop-shortcut hotkey), focus the existing one instead.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => revealWindow());
}

let win = null;
let through = false; // click-through state (input falls through to apps behind)

// Window/taskbar icon if it has been generated (npm run make-icon).
const ICON = (() => {
  for (const f of ["pewpew.ico", "pewpew.png"]) {
    const p = path.join(__dirname, "assets", f);
    if (fs.existsSync(p)) return p;
  }
  return undefined;
})();

function revealWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  win.setAlwaysOnTop(true, "screen-saver");
}

function createWindow() {
  const preload = path.join(__dirname, "preload.js");

  win = new BrowserWindow({
    transparent: true, // let the desktop / your code editor show through
    backgroundColor: "#00000000",
    frame: false, // no title bar / chrome
    alwaysOnTop: true, // float above other apps
    hasShadow: false,
    resizable: true, // drag the edges to resize the play area
    maximizable: false, // native maximize misbehaves on transparent frameless;
    // fullscreen is done explicitly via setBounds(workArea) instead
    skipTaskbar: false,
    fullscreenable: false,
    icon: ICON,
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

// --- Resize / fullscreen (driven by the renderer chrome) --------------------
// Moving is handled natively by the `-webkit-app-region: drag` surface; the
// resize grips and the fullscreen toggle come through IPC. Native maximize
// misbehaves on a transparent frameless window, so "fullscreen" = fill the
// display work area via setBounds, remembering the previous size to restore.
const MIN_W = 320;
const MIN_H = 240;
let savedBounds = null;
let isFull = false;

ipcMain.handle("win-get-bounds", () => (win ? win.getBounds() : null));

ipcMain.on("win-set-bounds", (_e, b) => {
  if (!win || !b) return;
  win.setBounds({
    x: Math.round(b.x),
    y: Math.round(b.y),
    width: Math.max(MIN_W, Math.round(b.width)),
    height: Math.max(MIN_H, Math.round(b.height)),
  });
  isFull = false; // a manual resize leaves fullscreen
  win.webContents.send("full-state", false);
});

ipcMain.on("win-toggle-full", () => {
  if (!win) return;
  const d = screen.getDisplayMatching(win.getBounds());
  if (!isFull) {
    savedBounds = win.getBounds();
    win.setBounds(d.workArea);
    isFull = true;
  } else {
    if (savedBounds) win.setBounds(savedBounds);
    isFull = false;
  }
  win.webContents.send("full-state", isFull);
});

ipcMain.handle("get-state", () => ({ through }));

app.on("will-quit", () => globalShortcut.unregisterAll());

app.on("window-all-closed", () => app.quit());
