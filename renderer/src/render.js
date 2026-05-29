/* Draws the whole scene on the transparent canvas — cleared to alpha 0 each
 * frame so only the wireframes show and the desktop shows through everywhere
 * else. Reads `state` and `paint`; mutates nothing.
 *
 * Every shape is drawn twice: a wider contrasting "halo" first, then the bright
 * ink with a soft glow. That outline is what makes the graphics legible over a
 * busy terminal — bright text and dark gaps alike — without painting an opaque
 * panel that would hide the code behind it. */
import { view, ctx } from "./view.js";
import { TAU, LINE_W } from "./config.js";
import { state } from "./state.js";
import { paint } from "./themes.js";

// Stroke the path currently on the context twice: halo underneath, ink on top.
function inkStroke(width = LINE_W) {
  ctx.lineWidth = width + 3;
  ctx.strokeStyle = paint.halo;
  ctx.shadowBlur = 0;
  ctx.stroke();
  ctx.lineWidth = width;
  ctx.strokeStyle = paint.ink;
  ctx.shadowColor = paint.glow;
  ctx.shadowBlur = 8;
  ctx.stroke();
}

// A filled square with a halo backing (for bullets) so it reads on light text.
function inkRect(x, y, s) {
  ctx.shadowBlur = 0;
  ctx.fillStyle = paint.halo;
  ctx.fillRect(x - s / 2 - 1.5, y - s / 2 - 1.5, s + 3, s + 3);
  ctx.fillStyle = paint.ink;
  ctx.shadowColor = paint.glow;
  ctx.shadowBlur = 5;
  ctx.fillRect(x - s / 2, y - s / 2, s, s);
}

function drawAsteroid(a) {
  ctx.beginPath();
  const n = a.shape.length;
  for (let i = 0; i < n; i++) {
    const ang = a.a + (i / n) * TAU;
    const rr = a.r * a.shape[i];
    const x = a.x + Math.cos(ang) * rr;
    const y = a.y + Math.sin(ang) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  inkStroke();
}

function drawShip() {
  const ship = state.ship;
  if (!ship) return;
  const blink = state.invuln > 0 && Math.floor(state.invuln * 12) % 2 === 0;
  if (!blink) {
    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(ship.a);
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-12, -11);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-12, 11);
    ctx.closePath();
    inkStroke();
    // thrust flame (out the back)
    if (ship.thrust && Math.random() > 0.35) {
      ctx.beginPath();
      ctx.moveTo(-6, -5);
      ctx.lineTo(-18 - Math.random() * 6, 0);
      ctx.lineTo(-6, 5);
      inkStroke(2);
    }
    // retro flame (out the nose) when reversing
    if (ship.reverse && Math.random() > 0.4) {
      ctx.beginPath();
      ctx.moveTo(14, -4);
      ctx.lineTo(22 + Math.random() * 4, 0);
      ctx.lineTo(14, 4);
      inkStroke(2);
    }
    ctx.restore();
  }
  // Shield ring (doesn't blink) whenever the ship is protected.
  if (state.invuln > 0) {
    ctx.beginPath();
    ctx.arc(ship.x, ship.y, ship.r + 7, 0, TAU);
    inkStroke(1.6);
  }
}

// Vector glyphs for each power-up, drawn centered in a ~±9 box (the caller has
// already translated to the pickup's center). Each just builds a path; the
// caller strokes it with the contrast halo.
const PU_ICON = {
  // Shield crest.
  shield() {
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(8, -5);
    ctx.lineTo(8, 1);
    ctx.lineTo(0, 9);
    ctx.lineTo(-8, 1);
    ctx.lineTo(-8, -5);
    ctx.closePath();
    inkStroke(2);
  },
  // Three shots fanning upward (triple-shot).
  triple() {
    for (const dx of [-7, 0, 7]) {
      ctx.beginPath();
      ctx.moveTo(dx - 4, 4);
      ctx.lineTo(dx, -6);
      ctx.lineTo(dx + 4, 4);
      inkStroke(2);
    }
  },
  // Lightning bolt (rapid-fire).
  rapid() {
    ctx.beginPath();
    ctx.moveTo(2, -9);
    ctx.lineTo(-6, 1);
    ctx.lineTo(-1, 1);
    ctx.lineTo(-3, 9);
    ctx.lineTo(6, -2);
    ctx.lineTo(1, -2);
    ctx.closePath();
    inkStroke(2);
  },
  // Heart (extra life).
  life() {
    ctx.beginPath();
    ctx.moveTo(0, 7);
    ctx.bezierCurveTo(-9, -1, -5, -10, 0, -3);
    ctx.bezierCurveTo(5, -10, 9, -1, 0, 7);
    ctx.closePath();
    inkStroke(2);
  },
};

function drawPowerup(p) {
  // Blink out in its final seconds to signal it's about to vanish.
  if (p.ttl < 3 && Math.floor(p.ttl * 8) % 2 === 0) return;
  // Token ring (gentle pulse) so pickups read as collectibles.
  const pulse = 1 + Math.sin(p.a * 2) * 0.06;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r * pulse, 0, TAU);
  inkStroke(1.6);
  // The icon itself, upright in the center.
  ctx.save();
  ctx.translate(p.x, p.y);
  (PU_ICON[p.kind] || PU_ICON.shield)();
  ctx.restore();
}

function drawBoss() {
  const bo = state.boss;
  if (!bo) return;
  ctx.save();
  ctx.translate(bo.x, bo.y);
  ctx.rotate(bo.a);
  // Arrowhead saucer pointing at the ship.
  ctx.beginPath();
  ctx.moveTo(bo.r, 0);
  ctx.lineTo(-bo.r * 0.6, -bo.r * 0.8);
  ctx.lineTo(-bo.r * 0.3, 0);
  ctx.lineTo(-bo.r * 0.6, bo.r * 0.8);
  ctx.closePath();
  if (bo.flash > 0) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = paint.ink;
    ctx.fill();
  }
  inkStroke(2.6);
  // Inner "eye".
  ctx.beginPath();
  ctx.arc(bo.r * 0.1, 0, bo.r * 0.22, 0, TAU);
  inkStroke(2);
  ctx.restore();

  // HP bar above it.
  const w = bo.r * 1.6;
  const h = 4;
  const x = bo.x - w / 2;
  const y = bo.y - bo.r - 12;
  ctx.shadowBlur = 0;
  ctx.fillStyle = paint.halo;
  ctx.fillRect(x - 1.5, y - 1.5, w + 3, h + 3);
  ctx.fillStyle = paint.ink;
  ctx.fillRect(x, y, w * (bo.hp / bo.maxHp), h);
}

export function render() {
  ctx.clearRect(0, 0, view.W, view.H); // fully transparent each frame

  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  for (const a of state.asteroids) drawAsteroid(a);

  drawBoss();
  for (const p of state.powerups) drawPowerup(p);

  // Hunter bullets: small haloed rings, distinct from the player's pixels.
  for (const b of state.enemyBullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, TAU);
    inkStroke(2);
  }

  // Player bullets: chunky pixels.
  for (const b of state.bullets) inkRect(b.x, b.y, 4);

  drawShip();

  // Particles (fading; bright fill, no halo to keep them cheap).
  ctx.shadowColor = paint.glow;
  ctx.shadowBlur = 4;
  ctx.fillStyle = paint.ink;
  for (const p of state.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillRect(p.x, p.y, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}
