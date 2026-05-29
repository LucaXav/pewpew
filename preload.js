// Bridges the renderer (game UI) to the main process over a minimal, safe API.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pew", {
  // Request click-through on/off from the renderer (e.g. the handle button).
  setThrough: (on) => ipcRenderer.send("set-through", on),
  // Notified when click-through changes (so the UI can hide its chrome).
  onThrough: (cb) => ipcRenderer.on("through", (_e, on) => cb(on)),
  // Make just the handle spot clickable while click-through is on.
  setInteractive: (on) => ipcRenderer.send("set-interactive", on),
  // Mode / pause toggles fired by global shortcuts.
  onToggleMode: (cb) => ipcRenderer.on("toggle-mode", () => cb()),
  onTogglePause: (cb) => ipcRenderer.on("toggle-pause", () => cb()),
  quit: () => ipcRenderer.send("quit"),
  getState: () => ipcRenderer.invoke("get-state"),
});
