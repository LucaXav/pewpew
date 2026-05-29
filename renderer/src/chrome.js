/* Window chrome: auto-hiding controls, reveal-on-hover, JS resize via the grips,
 * fullscreen toggle, and the click-through come-back behavior. Moving the window
 * is handled natively by the `-webkit-app-region: drag` surface in the markup;
 * only resizing and the interactive bits need JS here. */
import { CHROME_HIDE_MS, MIN_W, MIN_H, REVEAL_W, REVEAL_H } from "./config.js";
import { bridge } from "./bridge.js";
import { el, flashToast, kbd, hotkeys } from "./hud.js";
import { setMode, toggleMode, togglePause } from "./engine.js";
import { state } from "./state.js";
import { cycleTheme } from "./themes.js";

let throughOn = false;
let chromeHidden = false;
let hideAt = performance.now() + CHROME_HIDE_MS;
let cachedBounds = null; // last known window bounds (for move/resize math)
let drag = null; // active resize gesture
let focusMode = false; // "focus": paused + click-through so you can type behind it
let focusThrough = 0; // # of upcoming through events that focus drove (skip mode switch)

// Show the chrome and (re)arm the idle hide timer.
export function revealChrome() {
  if (chromeHidden) {
    chromeHidden = false;
    document.body.classList.remove("chrome-hidden");
  }
  hideAt = performance.now() + CHROME_HIDE_MS;
}

// Called every frame: hide once idle (but never mid-drag).
export function tickChrome(now) {
  if (!chromeHidden && !drag && now > hideAt) {
    chromeHidden = true;
    document.body.classList.add("chrome-hidden");
  }
}

// Arm the idle timer to fire on the next frame (test/debug hook).
export function hideChromeNow() {
  hideAt = performance.now() - 1;
}

export function isChromeHidden() {
  return chromeHidden;
}

export async function refreshBounds() {
  if (bridge) cachedBounds = await bridge.getBounds();
}

// Click-through implies you're working behind the overlay -> switch to ambient.
// Exception: when focus mode drove the toggle we leave the game exactly as it
// was (paused) so it resumes intact on the way out.
export function handleThrough(on) {
  throughOn = on;
  document.body.classList.toggle("through", on);
  revealChrome();
  if (focusThrough > 0) {
    focusThrough--;
    return;
  }
  setMode(on ? "ambient" : "play");
}

// Focus mode: one hotkey to freeze the game AND let clicks fall through to the
// app behind the overlay, so you can dart back to your editor, retype a prompt,
// and hit the hotkey again to resume right where you left off.
export function toggleFocus() {
  focusMode = !focusMode;
  document.body.classList.toggle("focus", focusMode);
  focusThrough++; // the through toggle below is focus-driven, not a mode switch
  if (focusMode) {
    if (!state.paused) togglePause(); // freeze
    if (bridge) bridge.setThrough(true);
    else handleThrough(true); // browser fallback (no OS click-through)
    flashToast(`PAUSED &middot; type behind — ${kbd(hotkeys.focus)} to resume`, 6000);
  } else {
    if (bridge) bridge.setThrough(false);
    else handleThrough(false);
    if (state.paused) togglePause(); // resume the same game
    flashToast("RESUMED", 1400);
  }
}

export function isFocusMode() {
  return focusMode;
}

// Plain pause (button / Ctrl+Shift+P) with a top flash so the resume key is
// obvious. Focus mode pauses separately and shows its own toast.
export function pauseToggle() {
  togglePause();
  if (state.paused) flashToast(`PAUSED &middot; ${kbd(hotkeys.pause)} to resume`, 6000);
  else flashToast("RESUMED", 1400);
}

// --- resize (drag a grip) ---------------------------------------------------
function beginResize(e, edge) {
  if (throughOn || !bridge || !cachedBounds) return;
  e.stopPropagation();
  drag = {
    edge,
    start: { ...cachedBounds },
    sx: e.screenX,
    sy: e.screenY,
  };
  document.body.classList.add("managing");
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch (_) {}
}

// Active resize drag.
function onResizeMove(e) {
  if (!drag || !bridge) return;
  revealChrome();
  let { x, y, width, height } = drag.start;
  const dx = e.screenX - drag.sx;
  const dy = e.screenY - drag.sy;
  const ed = drag.edge;
  if (ed.includes("e")) width = drag.start.width + dx;
  if (ed.includes("s")) height = drag.start.height + dy;
  if (ed.includes("w")) {
    width = drag.start.width - dx;
    x = drag.start.x + dx;
  }
  if (ed.includes("n")) {
    height = drag.start.height - dy;
    y = drag.start.y + dy;
  }
  if (width < MIN_W) {
    if (ed.includes("w")) x -= MIN_W - width;
    width = MIN_W;
  }
  if (height < MIN_H) {
    if (ed.includes("n")) y -= MIN_H - height;
    height = MIN_H;
  }
  cachedBounds = { x, y, width, height };
  bridge.setBounds(cachedBounds);
}

function onPointerUp() {
  if (!drag) return;
  drag = null;
  document.body.classList.remove("managing");
  revealChrome();
  refreshBounds();
}

// Hover: reveal the chrome near the top-left, and keep the come-back buttons
// clickable while click-through is on. Bound to both mouse + pointer move so it
// works with the forwarded events we get during click-through.
function onHover(e) {
  if (e.clientX < REVEAL_W && e.clientY < REVEAL_H) revealChrome();
  if (throughOn && bridge) {
    const r = el.controls.getBoundingClientRect();
    const pad = 8;
    const over =
      e.clientX >= r.left - pad &&
      e.clientX <= r.right + pad &&
      e.clientY >= r.top - pad &&
      e.clientY <= r.bottom + pad;
    bridge.setInteractive(over);
    if (over) revealChrome();
  }
}

export function setupControls() {
  el.btnThrough.addEventListener("click", () => bridge && bridge.setThrough(!throughOn));
  el.btnMode.addEventListener("click", toggleMode);
  el.btnPause.addEventListener("click", pauseToggle);
  el.btnQuit.addEventListener("click", () => bridge && bridge.quit());
  if (el.btnColor) el.btnColor.addEventListener("click", cycleTheme);

  // Resize grips (the rest of the surface is a native drag region).
  el.frame.querySelectorAll(".grip").forEach((g) => {
    g.addEventListener("pointerdown", (e) => beginResize(e, g.dataset.edge));
  });

  // Double-click ANYWHERE to toggle fullscreen. The drag surface is a native
  // drag region that swallows the `dblclick` event, so we detect a double-click
  // ourselves from two quick mousedowns at (nearly) the same spot. We also keep
  // the real dblclick on the no-drag spots as a belt-and-braces fallback.
  const goFull = (e) => {
    if (e && e.target && e.target.closest && e.target.closest("#controls, #frame, button")) return;
    if (!throughOn && bridge) bridge.toggleFull();
  };
  let lastDown = 0;
  let lastX = 0;
  let lastY = 0;
  window.addEventListener("mousedown", (e) => {
    if (throughOn) return;
    if (e.target && e.target.closest && e.target.closest("#controls, #frame, button")) return;
    const now = performance.now();
    if (now - lastDown < 350 && Math.abs(e.screenX - lastX) < 6 && Math.abs(e.screenY - lastY) < 6) {
      goFull(e);
      lastDown = 0;
    } else {
      lastDown = now;
      lastX = e.screenX;
      lastY = e.screenY;
    }
  });
  el.controls.addEventListener("dblclick", goFull);
  if (el.revealzone) {
    el.revealzone.addEventListener("dblclick", goFull);
    el.revealzone.addEventListener("mousemove", revealChrome);
  }
  window.addEventListener("mousemove", onHover);
  window.addEventListener("pointermove", onHover);
  window.addEventListener("pointermove", onResizeMove);
  window.addEventListener("pointerup", onPointerUp);
  // Keep cached bounds fresh after any (incl. native) resize.
  window.addEventListener("resize", refreshBounds);
}
