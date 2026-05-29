// Generates assets/pewpew.png (256x256) and assets/pewpew.ico procedurally —
// a dark rounded tile with a white 8-bit ship + a couple of asteroid rings,
// matching the in-game look. Zero dependencies (uses Node's zlib).
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const N = 256; // output size
const SS = 4; // supersampling factor for smooth edges
const assets = path.join(__dirname, "..", "assets");
fs.mkdirSync(assets, { recursive: true });

// ---- shape helpers (all in 256-space) -------------------------------------
const m = 8; // margin
const r = 46; // corner radius
const halfW = (N - 2 * m) / 2;
const halfH = (N - 2 * m) / 2;
const cx = N / 2;
const cy = N / 2;

function roundedSDF(x, y) {
  const qx = Math.abs(x - cx) - (halfW - r);
  const qy = Math.abs(y - cy) - (halfH - r);
  const outer = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inner = Math.min(Math.max(qx, qy), 0);
  return outer + inner - r; // <0 inside
}

// classic asteroids ship (concave), pointing up
const SHIP = [
  [128, 62],
  [182, 198],
  [128, 168],
  [74, 198],
];
function inPoly(x, y, p) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const xi = p[i][0],
      yi = p[i][1],
      xj = p[j][0],
      yj = p[j][1];
    const hit = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}
const RINGS = [
  { x: 200, y: 92, R: 21, t: 4.5 },
  { x: 58, y: 112, R: 15, t: 4 },
  { x: 188, y: 184, R: 12, t: 3.5 },
];

// returns [r,g,b,a] for a point in 256-space
function colorAt(x, y) {
  const sdf = roundedSDF(x, y);
  if (sdf > 0) return [0, 0, 0, 0]; // transparent outside the tile

  // ship + asteroids are white
  if (inPoly(x, y, SHIP)) return [255, 255, 255, 255];
  for (const c of RINGS) {
    const d = Math.hypot(x - c.x, y - c.y);
    if (d <= c.R && d >= c.R - c.t) return [255, 255, 255, 255];
  }
  // subtle white border just inside the edge
  if (sdf > -3) return [220, 226, 235, 255];
  return [11, 14, 20, 255]; // dark tile
}

// ---- rasterize with supersampling ----------------------------------------
const rgba = Buffer.alloc(N * N * 4);
for (let py = 0; py < N; py++) {
  for (let px = 0; px < N; px++) {
    let rr = 0,
      gg = 0,
      bb = 0,
      aa = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const fx = px + (sx + 0.5) / SS;
        const fy = py + (sy + 0.5) / SS;
        const [cr, cg, cb, ca] = colorAt(fx, fy);
        // premultiply so transparent edges blend cleanly
        rr += (cr * ca) / 255;
        gg += (cg * ca) / 255;
        bb += (cb * ca) / 255;
        aa += ca;
      }
    }
    const n = SS * SS;
    const a = aa / n;
    const i = (py * N + px) * 4;
    // un-premultiply
    rgba[i] = a > 0 ? Math.round((rr / n / a) * 255) : 0;
    rgba[i + 1] = a > 0 ? Math.round((gg / n / a) * 255) : 0;
    rgba[i + 2] = a > 0 ? Math.round((bb / n / a) * 255) : 0;
    rgba[i + 3] = Math.round(a);
  }
}

// ---- PNG encoder ----------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePNG(width, height, pixels) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // 10,11,12 = 0 (deflate, adaptive filter, no interlace)
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    pixels.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

const png = encodePNG(N, N, rgba);
fs.writeFileSync(path.join(assets, "pewpew.png"), png);

// ---- ICO wrapper (single PNG-compressed entry, Vista+) --------------------
const dir = Buffer.alloc(6);
dir.writeUInt16LE(0, 0); // reserved
dir.writeUInt16LE(1, 2); // type: icon
dir.writeUInt16LE(1, 4); // count
const entry = Buffer.alloc(16);
entry[0] = 0; // width 256 (0 == 256)
entry[1] = 0; // height 256
entry[2] = 0; // colors
entry[3] = 0; // reserved
entry.writeUInt16LE(1, 4); // planes
entry.writeUInt16LE(32, 6); // bpp
entry.writeUInt32LE(png.length, 8); // size
entry.writeUInt32LE(6 + 16, 12); // offset
fs.writeFileSync(path.join(assets, "pewpew.ico"), Buffer.concat([dir, entry, png]));

console.log(
  "wrote assets/pewpew.png (" + png.length + " bytes) and assets/pewpew.ico"
);
