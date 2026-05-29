/* Factories for the things on screen: the ship, asteroids, and explosion
 * particles. They only build/append objects — movement and collisions live in
 * the engine. */
import { view } from "./view.js";
import { TAU, SIZES, POWERUP_TTL, BOSS_HP } from "./config.js";
import { rand, randi } from "./utils.js";
import { state } from "./state.js";

export function makeShip() {
  return {
    x: view.W / 2,
    y: view.H / 2,
    r: 16,
    a: -Math.PI / 2, // pointing up
    vx: 0,
    vy: 0,
    thrust: false,
    cooldown: 0,
  };
}

export function makeAsteroid(tier, x, y, gentle) {
  const r = SIZES[tier] * rand(0.85, 1.15);
  // Gentle (ambient) rocks drift slowly; play rocks speed up with the level.
  const speed = gentle ? rand(8, 26) : rand(24, 70) + (state.level - 1) * 6;
  const ang = rand(0, TAU);
  // Pre-baked jagged silhouette for a chunky 8-bit-ish wireframe rock.
  const verts = randi(8, 12);
  const shape = [];
  for (let i = 0; i < verts; i++) {
    shape.push(rand(0.68, 1.0));
  }
  return {
    tier,
    x: x ?? rand(0, view.W),
    y: y ?? rand(0, view.H),
    r,
    vx: Math.cos(ang) * speed,
    vy: Math.sin(ang) * speed,
    a: rand(0, TAU),
    spin: rand(-1.2, 1.2),
    shape,
  };
}

export const POWERUP_KINDS = ["shield", "triple", "rapid", "life"];

// A slowly drifting pickup. Fly the ship over it to collect; it fades after TTL.
export function makePowerup(x, y, kind) {
  return {
    kind: kind ?? POWERUP_KINDS[randi(0, POWERUP_KINDS.length - 1)],
    x: x ?? rand(view.W * 0.15, view.W * 0.85),
    y: y ?? rand(view.H * 0.15, view.H * 0.85),
    r: 13,
    a: 0,
    vx: rand(-14, 14),
    vy: rand(-14, 14),
    ttl: POWERUP_TTL,
  };
}

// The hunter mini-boss: enters from an edge, then chases (see engine.updateBoss).
export function makeBoss() {
  const edge = randi(0, 3);
  let x, y;
  if (edge === 0) { x = -40; y = rand(0, view.H); }
  else if (edge === 1) { x = view.W + 40; y = rand(0, view.H); }
  else if (edge === 2) { x = rand(0, view.W); y = -40; }
  else { x = rand(0, view.W); y = view.H + 40; }
  return { x, y, r: 26, a: 0, vx: 0, vy: 0, hp: BOSS_HP, maxHp: BOSS_HP, fire: 1.6, flash: 0 };
}

export function spawnParticles(x, y, n, spread, life) {
  for (let i = 0; i < n; i++) {
    const ang = rand(0, TAU);
    const sp = rand(spread * 0.3, spread);
    state.particles.push({
      x,
      y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      life: rand(life * 0.5, life),
      maxLife: life,
      size: randi(1, 3),
    });
  }
}
