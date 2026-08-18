// Generates PWA icons as valid PNG files using only Node built-ins.
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// CRC32 table
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[i] = c;
}
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const tb  = Buffer.from(type);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tb, data])));
  return Buffer.concat([len, tb, data, crc]);
}

// Draw into a flat RGBA pixel array
function makeCanvas(size) {
  const buf = new Uint8Array(size * size * 4);
  const set = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const o = (y * size + x) * 4;
    buf[o] = r; buf[o+1] = g; buf[o+2] = b; buf[o+3] = a;
  };
  const fill = (r, g, b) => { for (let i = 0; i < size * size; i++) { buf[i*4]=r; buf[i*4+1]=g; buf[i*4+2]=b; buf[i*4+3]=255; } };
  // Draw anti-aliased circle (pill)
  const circle = (cx, cy, radius, r, g, b) => {
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
        const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (d < radius - 0.5) set(x, y, r, g, b);
        else if (d < radius + 0.5) { const a = Math.round((radius + 0.5 - d) * 255); if (a > 0) { const o=(y*size+x)*4; buf[o]=r;buf[o+1]=g;buf[o+2]=b;buf[o+3]=a; } }
      }
    }
  };
  // Draw line with given thickness
  const line = (x0, y0, x1, y1, t, r, g, b) => {
    const dx = x1 - x0, dy = y1 - y0, len = Math.sqrt(dx*dx+dy*dy);
    const steps = Math.ceil(len * 2);
    for (let s = 0; s <= steps; s++) {
      const tx = x0 + dx * s / steps, ty = y0 + dy * s / steps;
      circle(tx, ty, t / 2, r, g, b);
    }
  };
  // Draw rounded rectangle
  const rect = (x, y, w, h, radius, r, g, b) => {
    for (let py = y; py < y + h; py++)
      for (let px = x; px < x + w; px++) {
        const cx = Math.max(x + radius, Math.min(x + w - radius, px));
        const cy = Math.max(y + radius, Math.min(y + h - radius, py));
        const d = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
        if (d <= radius) set(px, py, r, g, b);
      }
  };
  return { buf, fill, circle, line, rect, size };
}

function encodePNG(canvas) {
  const { buf, size } = canvas;
  // RGBA → filter-none scanlines
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = y * (1 + size * 4) + 1 + x * 4;
      raw[dst] = buf[src]; raw[dst+1] = buf[src+1]; raw[dst+2] = buf[src+2]; raw[dst+3] = buf[src+3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function drawIcon(size) {
  const c = makeCanvas(size);
  const s = size;
  // Background: #08110d
  c.fill(8, 17, 13);

  // Rounded rect background (slightly lighter)
  c.rect(0, 0, s, s, Math.round(s * 0.18), 8, 17, 13);

  const lw = Math.max(3, Math.round(s * 0.028)); // line width
  const lc = [204, 255, 51]; // #ccff33 lime

  // Flowchart: top circle (start node)
  const topY  = Math.round(s * 0.14);
  const midY  = Math.round(s * 0.38);
  const botY  = Math.round(s * 0.68);
  const cx    = Math.round(s * 0.5);
  const diam  = Math.round(s * 0.11); // circle radius

  // Start node (circle)
  c.circle(cx, topY, diam, ...lc);

  // Line from start to decision
  c.line(cx, topY + diam, cx, midY - Math.round(s * 0.13), lw, ...lc);

  // Diamond (decision node)
  const dh = Math.round(s * 0.13); // half-height
  const dw = Math.round(s * 0.21); // half-width
  const diamond = [[cx, midY - dh], [cx + dw, midY], [cx, midY + dh], [cx - dw, midY]];
  for (let i = 0; i < 4; i++) {
    const [x0,y0] = diamond[i], [x1,y1] = diamond[(i+1)%4];
    c.line(x0, y0, x1, y1, lw, ...lc);
  }

  // Line from diamond to process box
  c.line(cx, midY + dh, cx, botY - Math.round(s * 0.08), lw, ...lc);

  // Process box (rounded rect outline)
  const bw = Math.round(s * 0.38), bh = Math.round(s * 0.15);
  const bx = cx - bw / 2, by = botY - bh / 2;
  const br = Math.round(s * 0.035);
  // draw outline by drawing filled + inner erased
  c.rect(Math.round(bx), Math.round(by), bw, bh, br, ...lc);
  c.rect(Math.round(bx + lw), Math.round(by + lw), bw - lw*2, bh - lw*2, Math.max(1, br - lw), 8, 17, 13);

  return c;
}

const outDir = path.resolve(__dirname, '../public/icons');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

for (const size of [192, 512]) {
  const canvas = drawIcon(size);
  const png    = encodePNG(canvas);
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), png);
  console.log(`icon-${size}.png written (${png.length} bytes)`);
}
// 180px apple-touch-icon
const apple = drawIcon(180);
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), encodePNG(apple));
console.log('apple-touch-icon.png written');
