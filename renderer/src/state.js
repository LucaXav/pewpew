/* Central mutable game state. One shared object so every module reads and
 * writes the same live values (no stale copies, no globals on window). */

export const state = {
  displayMode: "play", // 'play' | 'ambient'
  playState: "ready", // 'ready' | 'running' | 'over'
  paused: false,

  ship: null,
  bullets: [],
  asteroids: [],
  particles: [],
  powerups: [], // drifting pickups
  enemyBullets: [], // shots fired by the hunter
  boss: null, // the chasing mini-boss (one at a time)

  score: 0,
  lives: 3,
  level: 1,
  invuln: 0, // seconds of spawn protection / active shield
  respawnTimer: 0,

  // Active weapon buffs + the assorted spawn cadence timers (seconds).
  triple: 0,
  rapid: 0,
  powerupTimer: 0,
  bossTimer: 0,
  levelBanner: 0, // countdown while the "LEVEL N" flash shows

  hiscore: 0,
};

// Restore the persisted high score (best effort — storage may be unavailable).
try {
  state.hiscore = parseInt(localStorage.getItem("vibeshift.hi") || "0", 10) || 0;
} catch (e) {}
