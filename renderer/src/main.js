/* Renderer entry point. Wires the modules together, drives the animation loop,
 * connects to the Electron bridge (when present), and exposes a small test hook.
 *
 * Runs identically in Electron and in a plain browser (the bridge is optional),
 * which lets the game be driven by an automated browser for testing. */
import "./view.js"; // sets up the canvas + resize listener on import
import { state } from "./state.js";
import { update, keys, startGame, setMode, fire, toggleMode, togglePause } from "./engine.js";
import { render } from "./render.js";
import { updateHUD, updatePauseIcon, popScore, flashToast, kbd, hotkeys } from "./hud.js";
import { applyTheme, cycleTheme, currentTheme } from "./themes.js";
import {
  setupControls,
  tickChrome,
  refreshBounds,
  revealChrome,
  handleThrough,
  hideChromeNow,
  isChromeHidden,
  toggleFocus,
  isFocusMode,
  pauseToggle,
} from "./chrome.js";
import { bridge } from "./bridge.js";

// --- Main loop ---------------------------------------------------------------
let last = performance.now();
function loop(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05; // clamp big stalls
  if (!state.paused) {
    update(dt);
    render();
  }
  tickChrome(now); // fade the controls/frame out when idle
  requestAnimationFrame(loop);
}

// --- Boot --------------------------------------------------------------------
setupControls();
updatePauseIcon();
applyTheme();
refreshBounds();

if (bridge) {
  bridge.onThrough(handleThrough);
  bridge.onToggleMode(toggleMode);
  bridge.onTogglePause(pauseToggle);
  bridge.onToggleFocus(toggleFocus);
  bridge.onCycleTheme(cycleTheme);
  bridge.onFull(() => refreshBounds());
  bridge.onShortcuts((map) => {
    // Readable form (e.g. "Ctrl+Shift+F") for the toast key chips...
    const readable = (a) => (a ? a.replace("CommandOrControl", "Ctrl") : "");
    if (readable(map.focus)) hotkeys.focus = readable(map.focus);
    if (readable(map.pause)) hotkeys.pause = readable(map.pause);
    if (readable(map.through)) hotkeys.through = readable(map.through);
    if (readable(map.quit)) hotkeys.quit = readable(map.quit);

    // ...and a compact symbol form for the bottom hint bar.
    const pretty = (a) =>
      a
        ? a
            .replace("CommandOrControl", "^")
            .replace("Shift", "⇧")
            .replace("Alt", "⌥")
            .replace(/\+/g, "")
        : "(unbound)";
    const hints = document.getElementById("hints");
    if (hints) {
      hints.innerHTML =
        "<span><b>&larr; &rarr;</b> turn</span>" +
        "<span><b>&uarr; / &darr;</b> thrust</span>" +
        "<span><b>SPACE</b> fire</span>" +
        "<span><b>dbl-click</b> fullscreen</span>" +
        `<span><b>${pretty(map.focus)}</b> focus/pause</span>` +
        `<span><b>${pretty(map.through)}</b> through</span>` +
        `<span><b>${pretty(map.quit)}</b> quit</span>`;
    }
    // Now that we know the real key, flash the pause/focus hint.
    flashToast(`${kbd(hotkeys.focus)} pause &amp; type behind &middot; ${kbd(hotkeys.quit)} quit`, 7000);
  });
}

setMode("play");
updateHUD();
requestAnimationFrame(loop);

// Flash the pause/focus hint on launch. In Electron this is refreshed with the
// real bound key once `onShortcuts` arrives; in a plain browser it's the only
// flash, using the default labels.
if (!bridge) flashToast(`${kbd(hotkeys.focus)} pause &amp; type behind`, 6000);

// Expose a tiny hook for automated testing / debugging.
window.__pew = {
  state: () => ({
    displayMode: state.displayMode,
    playState: state.playState,
    paused: state.paused,
    score: state.score,
    lives: state.lives,
    level: state.level,
    asteroids: state.asteroids.length,
    bullets: state.bullets.length,
    particles: state.particles.length,
    powerups: state.powerups.length,
    enemyBullets: state.enemyBullets.length,
    boss: state.boss ? state.boss.hp : 0,
    triple: state.triple > 0,
    rapid: state.rapid > 0,
  }),
  startGame,
  setMode,
  fire,
  press: (name, v) => {
    keys[name] = v;
  },
  // chrome / window test hooks
  chromeHidden: isChromeHidden,
  revealChrome,
  hideChromeNow,
  togglePause,
  toggleFocus,
  focusMode: isFocusMode,
  toggleMode,
  popScore,
  cycleTheme,
  theme: currentTheme,
};
