/* The Asteroids engine: lifecycle (start/level/mode), input, and the per-frame
 * physics + collision update. Mutates `state`; the renderer reads it. */
import { view } from "./view.js";
import {
  SCORES,
  BASE_ROCKS,
  LEVEL_BANNER,
  POWERUP_EVERY,
  TRIPLE_TIME,
  RAPID_TIME,
  SHIELD_TIME,
  BOSS_FROM_LEVEL,
  BOSS_EVERY,
  BOSS_SCORE,
} from "./config.js";
import { rand, randi, wrap } from "./utils.js";
import { state } from "./state.js";
import { makeShip, makeAsteroid, makePowerup, makeBoss, spawnParticles } from "./entities.js";
import { updateHUD, showBanner, hideBanner, popScore, updatePauseIcon } from "./hud.js";

// --- Level / lifecycle -------------------------------------------------------
export function startGame() {
  state.score = 0;
  state.lives = 3;
  state.level = 1;
  state.bullets = [];
  state.enemyBullets = [];
  state.particles = [];
  state.powerups = [];
  state.boss = null;
  state.ship = makeShip();
  state.invuln = 2.5;
  state.triple = 0;
  state.rapid = 0;
  state.levelBanner = 0;
  state.powerupTimer = POWERUP_EVERY * 0.6;
  state.bossTimer = BOSS_EVERY;
  spawnLevel();
  state.playState = "running";
  hideBanner();
  updateHUD();
}

// Populate the current level: BASE_ROCKS + level big rocks, kept clear of the
// ship's center spawn.
function spawnLevel() {
  state.asteroids = [];
  const count = BASE_ROCKS + state.level;
  for (let i = 0; i < count; i++) {
    let a;
    do {
      a = makeAsteroid(3);
    } while (state.ship && Math.hypot(a.x - state.ship.x, a.y - state.ship.y) < 180);
    state.asteroids.push(a);
  }
}

function ambientField() {
  state.asteroids = [];
  state.bullets = [];
  state.enemyBullets = [];
  state.powerups = [];
  state.boss = null;
  const count = Math.max(6, Math.round((view.W * view.H) / 220000));
  for (let i = 0; i < count; i++) {
    state.asteroids.push(makeAsteroid(randi(1, 3), undefined, undefined, true));
  }
}

export function setMode(mode) {
  state.displayMode = mode;
  if (mode === "ambient") {
    ambientField();
    hideBanner();
  } else {
    state.playState = "ready";
    state.ship = makeShip();
    state.bullets = [];
    state.enemyBullets = [];
    state.powerups = [];
    state.boss = null;
    state.asteroids = [];
    for (let i = 0; i < 5; i++) state.asteroids.push(makeAsteroid(3, undefined, undefined, true));
    showBanner("VIBE SHIFT", "PRESS SPACE / FIRE TO START");
  }
  updateHUD();
}

export function toggleMode() {
  setMode(state.displayMode === "play" ? "ambient" : "play");
}

export function togglePause() {
  state.paused = !state.paused;
  updatePauseIcon();
}

function loseLife() {
  // Guard against several hazards landing in the same frame (asteroid + enemy
  // bullet + boss ram) — only the first should cost a life.
  if (!state.ship || state.respawnTimer > 0) return;
  spawnParticles(state.ship.x, state.ship.y, 40, 220, 1.0);
  state.lives--;
  updateHUD();
  if (state.lives <= 0) {
    state.playState = "over";
    state.ship = null;
    if (state.score > state.hiscore) {
      state.hiscore = state.score;
      try {
        localStorage.setItem("vibeshift.hi", String(state.hiscore));
      } catch (e) {}
    }
    showBanner("GAME OVER", "SCORE " + state.score + " — FIRE TO RETRY");
  } else {
    state.respawnTimer = 1.2; // brief pause before respawn
  }
}

function splitAsteroid(idx) {
  const a = state.asteroids[idx];
  state.score += SCORES[a.tier];
  updateHUD();
  if (state.displayMode === "play") popScore(SCORES[a.tier]);
  spawnParticles(a.x, a.y, 14 + a.tier * 6, 120 + a.tier * 30, 0.7);
  state.asteroids.splice(idx, 1);
  if (a.tier > 1) {
    const children = 2;
    for (let i = 0; i < children; i++) {
      const child = makeAsteroid(a.tier - 1, a.x, a.y);
      // push children apart a bit
      child.vx += rand(-30, 30);
      child.vy += rand(-30, 30);
      state.asteroids.push(child);
    }
  }
  // Clear every rock to advance to the next (bigger, faster) level.
  if (state.displayMode === "play" && state.asteroids.length === 0) {
    state.level++;
    state.invuln = Math.max(state.invuln, 1.2);
    state.levelBanner = LEVEL_BANNER;
    showBanner("LEVEL " + state.level, "");
    spawnLevel();
    updateHUD();
  }
}

// Apply a collected power-up. Shield reuses the invulnerability timer; triple
// and rapid are weapon buffs read by fire(); life is an extra ship.
function applyPowerup(kind) {
  if (kind === "shield") state.invuln = Math.max(state.invuln, SHIELD_TIME);
  else if (kind === "triple") state.triple = TRIPLE_TIME;
  else if (kind === "rapid") state.rapid = RAPID_TIME;
  else if (kind === "life") state.lives++;
  if (state.ship) spawnParticles(state.ship.x, state.ship.y, 18, 140, 0.5);
  if (state.displayMode === "play") popScore(kind.toUpperCase());
  updateHUD();
}

// A player bullet (or a ship ram) hits the hunter. Returns true if it died.
function hitBoss() {
  const bo = state.boss;
  if (!bo) return false;
  bo.hp--;
  bo.flash = 0.12;
  spawnParticles(bo.x, bo.y, 6, 90, 0.4);
  if (bo.hp <= 0) {
    state.score += BOSS_SCORE;
    if (state.displayMode === "play") popScore(BOSS_SCORE);
    spawnParticles(bo.x, bo.y, 60, 260, 1.1);
    state.powerups.push(makePowerup(bo.x, bo.y)); // reward drop
    state.boss = null;
    updateHUD();
    return true;
  }
  return false;
}

export function fire() {
  const ship = state.ship;
  if (!ship || ship.cooldown > 0) return;
  if (state.bullets.length > 12) return;
  const speed = 520;
  // Triple-shot fans three bullets; otherwise a single forward shot.
  const spread = state.triple > 0 ? [-0.22, 0, 0.22] : [0];
  for (const off of spread) {
    const a = ship.a + off;
    state.bullets.push({
      x: ship.x + Math.cos(a) * ship.r,
      y: ship.y + Math.sin(a) * ship.r,
      vx: Math.cos(a) * speed + ship.vx,
      vy: Math.sin(a) * speed + ship.vy,
      r: 2,
      life: 0.9,
    });
  }
  ship.cooldown = state.rapid > 0 ? 0.07 : 0.18; // rapid-fire shortens the gap
}

// --- Input -------------------------------------------------------------------
export const keys = Object.create(null);

const HANDLED = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "a", "d", "w", "s", "A", "D", "W", "S"];

function onKey(e, down) {
  const k = e.key;
  if (HANDLED.includes(k)) e.preventDefault();

  if (k === "ArrowLeft" || k === "a" || k === "A") keys.left = down;
  if (k === "ArrowRight" || k === "d" || k === "D") keys.right = down;
  if (k === "ArrowUp" || k === "w" || k === "W") keys.up = down;
  if (k === "ArrowDown" || k === "s" || k === "S") keys.down = down;
  if (k === " " || k === "Enter") {
    if (down) {
      if (state.displayMode === "play" && state.playState !== "running") startGame();
      else keys.fireQueued = true;
    }
  }
}
window.addEventListener("keydown", (e) => onKey(e, true));
window.addEventListener("keyup", (e) => onKey(e, false));

// Drive the hunter: steer toward the ship (but capped slower than the ship so
// it stays escapable), wrap, and lob the occasional aimed shot.
function updateBoss(dt) {
  const bo = state.boss;
  if (!bo) return;
  if (bo.flash > 0) bo.flash -= dt;
  const target = state.ship;
  if (target) {
    const ang = Math.atan2(target.y - bo.y, target.x - bo.x);
    bo.a = ang;
    const ACC = 150;
    bo.vx += Math.cos(ang) * ACC * dt;
    bo.vy += Math.sin(ang) * ACC * dt;
  }
  const sp = Math.hypot(bo.vx, bo.vy);
  const MAX = 150 + state.level * 8;
  if (sp > MAX) {
    bo.vx = (bo.vx / sp) * MAX;
    bo.vy = (bo.vy / sp) * MAX;
  }
  bo.x += bo.vx * dt;
  bo.y += bo.vy * dt;
  wrap(bo);
  // Fire at the ship on a cadence that tightens as levels climb.
  if (target && state.playState === "running") {
    bo.fire -= dt;
    if (bo.fire <= 0) {
      const ang = Math.atan2(target.y - bo.y, target.x - bo.x);
      const s = 240;
      state.enemyBullets.push({ x: bo.x, y: bo.y, vx: Math.cos(ang) * s, vy: Math.sin(ang) * s, r: 3, life: 3 });
      bo.fire = Math.max(1.1, 2.4 - state.level * 0.1);
    }
  }
}

// --- Update ------------------------------------------------------------------
export function update(dt) {
  // Asteroids always move (both modes).
  for (const a of state.asteroids) {
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    a.a += a.spin * dt;
    wrap(a);
  }

  // Particles
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.98;
    p.vy *= 0.98;
    p.life -= dt;
    if (p.life <= 0) state.particles.splice(i, 1);
  }

  // Power-ups drift + spin and expire after their TTL (arrays are empty unless
  // we're in a running game, so this is free in the menu / ambient modes).
  for (let i = state.powerups.length - 1; i >= 0; i--) {
    const p = state.powerups[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.a += dt * 1.5;
    wrap(p);
    p.ttl -= dt;
    if (p.ttl <= 0) state.powerups.splice(i, 1);
  }

  // Enemy (hunter) bullets fly straight and time out.
  for (let i = state.enemyBullets.length - 1; i >= 0; i--) {
    const b = state.enemyBullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    wrap(b);
    if (b.life <= 0) state.enemyBullets.splice(i, 1);
  }

  updateBoss(dt);

  if (state.displayMode !== "play" || state.playState !== "running") return;

  if (state.invuln > 0) state.invuln -= dt;

  // Weapon-buff countdowns; refresh the HUD label as each one lapses.
  if (state.triple > 0) {
    state.triple -= dt;
    if (state.triple <= 0) updateHUD();
  }
  if (state.rapid > 0) {
    state.rapid -= dt;
    if (state.rapid <= 0) updateHUD();
  }

  // Auto-clear the brief "LEVEL N" flash.
  if (state.levelBanner > 0) {
    state.levelBanner -= dt;
    if (state.levelBanner <= 0) hideBanner();
  }

  // Occasional drifting power-up (at most a few on screen at once).
  state.powerupTimer -= dt;
  if (state.powerupTimer <= 0) {
    if (state.powerups.length < 3) state.powerups.push(makePowerup());
    state.powerupTimer = POWERUP_EVERY * rand(0.7, 1.3);
  }

  // Spawn the hunter (one at a time, from a set level onward).
  state.bossTimer -= dt;
  if (state.bossTimer <= 0) {
    if (!state.boss && state.level >= BOSS_FROM_LEVEL) state.boss = makeBoss();
    state.bossTimer = BOSS_EVERY * rand(0.8, 1.2);
  }

  if (state.respawnTimer > 0) {
    state.respawnTimer -= dt;
    if (state.respawnTimer <= 0) {
      state.ship = makeShip();
      state.invuln = 2.0;
    }
    return; // ship is gone during respawn pause
  }

  const ship = state.ship;
  if (!ship) return;

  // Ship rotation & thrust
  const TURN = 3.4;
  if (keys.left) ship.a -= TURN * dt;
  if (keys.right) ship.a += TURN * dt;
  ship.thrust = !!keys.up;
  if (ship.thrust) {
    const ACC = 320;
    ship.vx += Math.cos(ship.a) * ACC * dt;
    ship.vy += Math.sin(ship.a) * ACC * dt;
  }
  // Reverse thrust (Down / S): a gentler push straight backwards.
  ship.reverse = !!keys.down;
  if (ship.reverse) {
    const REV = 200;
    ship.vx -= Math.cos(ship.a) * REV * dt;
    ship.vy -= Math.sin(ship.a) * REV * dt;
  }
  // friction + speed cap
  ship.vx *= Math.pow(0.55, dt);
  ship.vy *= Math.pow(0.55, dt);
  const sp = Math.hypot(ship.vx, ship.vy);
  const MAX = 460;
  if (sp > MAX) {
    ship.vx = (ship.vx / sp) * MAX;
    ship.vy = (ship.vy / sp) * MAX;
  }
  ship.x += ship.vx * dt;
  ship.y += ship.vy * dt;
  wrap(ship);

  if (ship.cooldown > 0) ship.cooldown -= dt;
  if (keys.fireQueued) {
    fire();
    keys.fireQueued = false;
  }

  // Bullets
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const b = state.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    wrap(b);
    if (b.life <= 0) {
      state.bullets.splice(i, 1);
      continue;
    }
    // bullet vs hunter (checked first so it can soak shots meant for it)
    if (state.boss && Math.hypot(state.boss.x - b.x, state.boss.y - b.y) < state.boss.r) {
      state.bullets.splice(i, 1);
      hitBoss();
      continue;
    }
    // bullet vs asteroid
    for (let j = state.asteroids.length - 1; j >= 0; j--) {
      const a = state.asteroids[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < a.r) {
        state.bullets.splice(i, 1);
        splitAsteroid(j);
        break;
      }
    }
  }

  // ship vs power-up: fly over one to collect it.
  for (let i = state.powerups.length - 1; i >= 0; i--) {
    const p = state.powerups[i];
    if (Math.hypot(p.x - ship.x, p.y - ship.y) < p.r + ship.r) {
      applyPowerup(p.kind);
      state.powerups.splice(i, 1);
    }
  }

  // ship vs asteroid
  if (state.invuln <= 0 && state.ship) {
    for (let j = 0; j < state.asteroids.length; j++) {
      const a = state.asteroids[j];
      if (Math.hypot(a.x - ship.x, a.y - ship.y) < a.r + ship.r * 0.7) {
        loseLife();
        break;
      }
    }
  }

  // ship vs enemy bullets
  if (state.invuln <= 0 && state.ship) {
    for (let i = state.enemyBullets.length - 1; i >= 0; i--) {
      const b = state.enemyBullets[i];
      if (Math.hypot(b.x - ship.x, b.y - ship.y) < b.r + ship.r * 0.7) {
        state.enemyBullets.splice(i, 1);
        loseLife();
        break;
      }
    }
  }

  // ship vs hunter ram: hurts the boss too, but costs a life.
  if (state.invuln <= 0 && state.ship && state.boss) {
    const bo = state.boss;
    if (Math.hypot(bo.x - ship.x, bo.y - ship.y) < bo.r + ship.r * 0.6) {
      hitBoss();
      loseLife();
    }
  }
}
