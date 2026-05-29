/* Color themes for the graphics + UI. Cycles White → Green → Amber → Cyan →
 * Auto. "auto" periodically samples the desktop behind the transparent window
 * (via the Electron bridge) and flips to a contrasting ink so shapes stay
 * visible. `paint` holds the live ink/glow the renderer reads each frame. */
import { THEMES, AUTO_DARK, AUTO_LIGHT } from "./config.js";
import { bridge } from "./bridge.js";
import { el } from "./hud.js";

// `ink` is the bright wireframe color; `halo` is the contrasting outline drawn
// underneath it so the graphics read on ANY background (e.g. white code text in
// a terminal) without filling the area behind them.
export const paint = { ink: "#ffffff", glow: "rgba(255,255,255,0.6)", halo: "rgba(0,0,0,0.6)" };

// Relative luminance of a #rrggbb color, 0 (black) .. 1 (white).
function hexLum(hex) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

let themeIndex = 0;
let autoTimer = null;

// Restore the persisted theme choice.
try {
  const savedTheme = localStorage.getItem("vibeshift.theme");
  const idx = THEMES.findIndex((t) => t.id === savedTheme);
  if (idx >= 0) themeIndex = idx;
} catch (e) {}

function setInk(i, g) {
  paint.ink = i;
  paint.glow = g;
  // Pick the opposite-brightness halo so the outline always contrasts the ink.
  paint.halo = hexLum(i) > 0.5 ? "rgba(0,0,0,0.62)" : "rgba(255,255,255,0.7)";
  document.documentElement.style.setProperty("--ink", i);
  document.documentElement.style.setProperty("--glow", "0 0 6px " + g);
}

function stopAuto() {
  if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
  }
}

async function sampleOnce() {
  if (!bridge) return;
  const s = await bridge.sampleBg();
  if (!s || typeof s.lum !== "number") return;
  const pick = s.lum < 0.5 ? AUTO_DARK : AUTO_LIGHT;
  setInk(pick.ink, pick.glow);
}

function startAuto() {
  if (!bridge) {
    setInk(AUTO_DARK.ink, AUTO_DARK.glow); // browser fallback (no capture API)
    return;
  }
  sampleOnce();
  stopAuto();
  autoTimer = setInterval(sampleOnce, 2000); // re-check the background
}

export function applyTheme() {
  const t = THEMES[themeIndex];
  if (t.id === "auto") startAuto();
  else {
    stopAuto();
    setInk(t.ink, t.glow);
  }
  if (el.btnColor) el.btnColor.title = "Color: " + t.id.toUpperCase() + " — click to change";
  try {
    localStorage.setItem("vibeshift.theme", t.id);
  } catch (e) {}
}

export function cycleTheme() {
  themeIndex = (themeIndex + 1) % THEMES.length;
  applyTheme();
}

// For test/debug hooks.
export function currentTheme() {
  return { id: THEMES[themeIndex].id, ink: paint.ink, glow: paint.glow };
}
