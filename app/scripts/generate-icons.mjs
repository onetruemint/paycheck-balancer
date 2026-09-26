// Generates the placeholder StateMint icons (mint leaf on charcoal) into public/.
// Dependency-free: rasterises with supersampling and encodes PNG via node:zlib.
// Run: npm run icons
import { writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';

const MINT = [0x78, 0xe6, 0xc3];
const BLACK = [0x29, 0x29, 0x29];

// Leaf = intersection of two circles, in coordinates normalised to [-0.5, 0.5].
const LEAF_HALF_LEN = 0.31;
const LEAF_HALF_WIDTH = 0.17;
const R = (LEAF_HALF_LEN ** 2 / LEAF_HALF_WIDTH + LEAF_HALF_WIDTH) / 2;
const D = R - LEAF_HALF_WIDTH;
const RIB = 0.018;
const CORNER = 0.22;

function sample(x, y, { maskable }) {
  // Background: rounded square (or full bleed for maskable icons).
  if (!maskable) {
    const qx = Math.max(Math.abs(x) - (0.5 - CORNER), 0);
    const qy = Math.max(Math.abs(y) - (0.5 - CORNER), 0);
    if (qx * qx + qy * qy > CORNER * CORNER) return null;
  }
  const s = maskable ? 0.78 : 1; // keep the glyph inside the maskable safe zone
  // Rotate 45° so the leaf points to the top-right.
  const u = (x - y) * Math.SQRT1_2 / s;
  const v = (x + y) * Math.SQRT1_2 / s;
  const inLeaf = u * u + (v - D) ** 2 < R * R && u * u + (v + D) ** 2 < R * R;
  if (inLeaf && !(Math.abs(v) < RIB && Math.abs(u) < LEAF_HALF_LEN * 0.8)) return MINT;
  return BLACK;
}

function render(size, opts) {
  const SS = 4;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0; // filter: none
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sample((px + (sx + 0.5) / SS) / size - 0.5, (py + (sy + 0.5) / SS) / size - 0.5, opts);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a += 255; }
        }
      }
      const n = SS * SS;
      const o = py * (size * 4 + 1) + 1 + px * 4;
      const cov = a / 255;
      raw[o] = cov ? Math.round(r / cov) : 0;
      raw[o + 1] = cov ? Math.round(g / cov) : 0;
      raw[o + 2] = cov ? Math.round(b / cov) : 0;
      raw[o + 3] = Math.round(a / n);
    }
  }
  return png(size, raw);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

function png(size, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function svg() {
  const S = 512;
  const f = (n) => +(n * S).toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}">
  <rect width="${S}" height="${S}" rx="${f(CORNER)}" fill="#292929"/>
  <g transform="translate(${S / 2} ${S / 2}) rotate(-45)">
    <path d="M${f(-LEAF_HALF_LEN)} 0A${f(R)} ${f(R)} 0 0 1 ${f(LEAF_HALF_LEN)} 0A${f(R)} ${f(R)} 0 0 1 ${f(-LEAF_HALF_LEN)} 0Z" fill="#78e6c3"/>
    <path d="M${f(-LEAF_HALF_LEN * 0.8)} 0H${f(LEAF_HALF_LEN * 0.8)}" stroke="#292929" stroke-width="${f(RIB * 2)}" stroke-linecap="round"/>
  </g>
</svg>
`;
}

const out = new URL('../public/', import.meta.url);
writeFileSync(new URL('icon.svg', out), svg());
writeFileSync(new URL('icon-192.png', out), render(192, { maskable: false }));
writeFileSync(new URL('icon-512.png', out), render(512, { maskable: false }));
writeFileSync(new URL('icon-maskable-512.png', out), render(512, { maskable: true }));
writeFileSync(new URL('apple-touch-icon.png', out), render(180, { maskable: true }));
console.log('Icons written to public/');
