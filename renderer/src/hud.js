/* The DOM overlay: score/lives readout, the center banner, the "+N" score pop,
 * the top command flash, and the pause-button icon swap. Reads game state;
 * never mutates it. */
import { state } from "./state.js";

// Readable hotkey labels, defaulted to the primary accelerators and refreshed
// from the real bound combos once main.js learns them (see onShortcuts). Used
// by the command-flash toasts so the displayed key is always the live one.
export const hotkeys = {
  focus: "Ctrl+Shift+F",
  pause: "Ctrl+Shift+P",
  through: "Ctrl+Shift+O",
  quit: "Ctrl+Shift+Q",
};

// Render an accelerator like "Ctrl+Shift+F" as <kbd> chips for the toast.
export function kbd(accel) {
  return (accel || "")
    .split("+")
    .map((p) => `<kbd>${p}</kbd>`)
    .join("");
}

// All the chrome/HUD elements, looked up once.
export const el = {
  score: document.getElementById("score"),
  hiscore: document.getElementById("hiscore"),
  lives: document.getElementById("lives"),
  mode: document.getElementById("mode"),
  banner: document.getElementById("banner"),
  bannerTitle: document.getElementById("banner-title"),
  bannerSub: document.getElementById("banner-sub"),
  toast: document.getElementById("toast"),
  controls: document.getElementById("controls"),
  frame: document.getElementById("frame"),
  revealzone: document.getElementById("revealzone"),
  scorepop: document.getElementById("scorepop"),
  btnThrough: document.getElementById("btn-through"),
  btnMode: document.getElementById("btn-mode"),
  btnPause: document.getElementById("btn-pause"),
  btnQuit: document.getElementById("btn-quit"),
  btnColor: document.getElementById("btn-color"),
};

// Swap the pause button between |‍| (pause) and ▶ (play) to mirror state.
const PAUSE_SVG =
  '<rect x="6" y="5" width="4" height="14" rx="1" class="fill" />' +
  '<rect x="14" y="5" width="4" height="14" rx="1" class="fill" />';
const PLAY_SVG = '<path d="M7 5 L19 12 L7 19 Z" class="fill" />';

export function updatePauseIcon() {
  const svg = el.btnPause.querySelector("svg");
  if (svg) svg.innerHTML = state.paused ? PLAY_SVG : PAUSE_SVG;
}

// Pop a tile near the score (right-hand side): "+N" for points, or a plain
// label like "TRIPLE" when a power-up is collected.
export function popScore(n) {
  if (!el.scorepop) return;
  const tile = document.createElement("div");
  tile.className = "pop";
  tile.textContent = typeof n === "number" ? "+" + n : n;
  el.scorepop.appendChild(tile);
  setTimeout(() => tile.remove(), 760);
}

export function updateHUD() {
  el.score.textContent = "SCORE " + state.score;
  el.hiscore.textContent = "HI " + Math.max(state.hiscore, state.score);
  el.lives.textContent = state.lives > 0 ? "▲ ".repeat(state.lives).trim() : "—";
  // Mode line doubles as an active-buff readout (e.g. "PLAY · TRIPLE RAPID").
  const buffs = [];
  if (state.triple > 0) buffs.push("TRIPLE");
  if (state.rapid > 0) buffs.push("RAPID");
  el.mode.textContent = state.displayMode.toUpperCase() + (buffs.length ? " · " + buffs.join(" ") : "");
}

export function showBanner(title, sub) {
  el.bannerTitle.textContent = title;
  el.bannerSub.textContent = sub;
  el.banner.classList.remove("hidden");
}

export function hideBanner() {
  el.banner.classList.add("hidden");
}

// Flash a message in the top-center toast for `ms` milliseconds, then fade it.
// `html` may contain markup (e.g. <kbd> chips). A new flash cancels the old one.
let toastTimer = null;
export function flashToast(html, ms = 5000) {
  if (!el.toast) return;
  el.toast.innerHTML = html;
  el.toast.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove("show"), ms);
}
