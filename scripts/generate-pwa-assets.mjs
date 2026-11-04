import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const publicDir = path.join(process.cwd(), 'public');
fs.mkdirSync(path.join(publicDir, 'icons'), { recursive: true });
fs.mkdirSync(path.join(publicDir, 'splash'), { recursive: true });
fs.mkdirSync(path.join(publicDir, 'screenshots'), { recursive: true });
fs.mkdirSync(path.join(publicDir, 'images'), { recursive: true });

// Official UPSA Pulse Design Brief Palette
const NAVY_950 = [7, 28, 61, 255];     // #071C3D
const NAVY_900 = [11, 42, 91, 255];    // #0B2A5B
const NAVY_700 = [28, 74, 143, 255];   // #1C4A8F
const NAVY_100 = [220, 230, 245, 255]; // #DCE6F5
const GOLD_500 = [217, 162, 27, 255];  // #D9A21B
const GOLD_100 = [251, 243, 220, 255]; // #FBF3DC
const BG_PAPER = [247, 248, 251, 255]; // #F7F8FB
const WHITE = [255, 255, 255, 255];    // #FFFFFF

// CRC32 Table for PNG chunk encoding
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgbaBuffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter type 0 (None)
    rgbaBuffer.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }

  const compressed = zlib.deflateSync(raw, { level: 6 });
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function blendPixel(buf, width, height, x, y, rgba, alphaScale = 1) {
  if (x < 0 || x >= width || y < 0 || y >= height) return;
  const idx = (y * width + x) * 4;
  const a = (rgba[3] / 255) * alphaScale;
  if (a <= 0) return;
  if (a >= 0.999) {
    buf[idx] = rgba[0];
    buf[idx + 1] = rgba[1];
    buf[idx + 2] = rgba[2];
    buf[idx + 3] = 255;
    return;
  }
  const inv = 1 - a;
  buf[idx] = Math.round(rgba[0] * a + buf[idx] * inv);
  buf[idx + 1] = Math.round(rgba[1] * a + buf[idx + 1] * inv);
  buf[idx + 2] = Math.round(rgba[2] * a + buf[idx + 2] * inv);
  buf[idx + 3] = 255;
}

function fillBackground(buf, width, height, topColor, bottomColor) {
  for (let y = 0; y < height; y++) {
    const t = y / Math.max(1, height - 1);
    const r = Math.round(topColor[0] * (1 - t) + bottomColor[0] * t);
    const g = Math.round(topColor[1] * (1 - t) + bottomColor[1] * t);
    const b = Math.round(topColor[2] * (1 - t) + bottomColor[2] * t);
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      buf[idx] = r;
      buf[idx + 1] = g;
      buf[idx + 2] = b;
      buf[idx + 3] = 255;
    }
  }
}

function drawFilledCircle(buf, width, height, cx, cy, r, color) {
  const r2 = (r + 1) * (r + 1);
  const minX = Math.max(0, Math.floor(cx - r - 1));
  const maxX = Math.min(width - 1, Math.ceil(cx + r + 1));
  const minY = Math.max(0, Math.floor(cy - r - 1));
  const maxY = Math.min(height - 1, Math.ceil(cy + r + 1));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 <= r2) {
        const dist = Math.sqrt(d2);
        const aa = Math.max(0, Math.min(1, r + 0.5 - dist));
        blendPixel(buf, width, height, x, y, color, aa);
      }
    }
  }
}

function drawRing(buf, width, height, cx, cy, outerR, thickness, color, alpha = 1) {
  const innerR = outerR - thickness;
  const minX = Math.max(0, Math.floor(cx - outerR - 2));
  const maxX = Math.min(width - 1, Math.ceil(cx + outerR + 2));
  const minY = Math.max(0, Math.floor(cy - outerR - 2));
  const maxY = Math.min(height - 1, Math.ceil(cy + outerR + 2));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dist = Math.hypot(x - cx, y - cy);
      if (dist >= innerR - 1 && dist <= outerR + 1) {
        const aaOuter = Math.max(0, Math.min(1, outerR + 0.5 - dist));
        const aaInner = Math.max(0, Math.min(1, dist - (innerR - 0.5)));
        blendPixel(buf, width, height, x, y, color, aaOuter * aaInner * alpha);
      }
    }
  }
}

function drawRoundedRect(buf, width, height, rx, ry, rw, rh, radius, color) {
  const minX = Math.max(0, Math.floor(rx));
  const maxX = Math.min(width - 1, Math.ceil(rx + rw));
  const minY = Math.max(0, Math.floor(ry));
  const maxY = Math.min(height - 1, Math.ceil(ry + rh));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      let dx = 0;
      let dy = 0;
      if (x < rx + radius) dx = rx + radius - x;
      else if (x > rx + rw - radius) dx = x - (rx + rw - radius);
      if (y < ry + radius) dy = ry + radius - y;
      else if (y > ry + rh - radius) dy = y - (ry + rh - radius);
      const dist = Math.hypot(dx, dy);
      if (dist <= radius + 0.5) {
        const aa = dx === 0 && dy === 0 ? 1 : Math.max(0, Math.min(1, radius + 0.5 - dist));
        blendPixel(buf, width, height, x, y, color, aa);
      }
    }
  }
}

function drawPulsePinEmblem(buf, width, height, cx, cy, scale) {
  // Concentric campus pulse rings
  drawRing(buf, width, height, cx, cy - scale * 0.06, scale * 0.44, Math.max(2, scale * 0.025), GOLD_500, 0.25);
  drawRing(buf, width, height, cx, cy - scale * 0.06, scale * 0.34, Math.max(2, scale * 0.03), GOLD_500, 0.48);

  // Location Pin Head (Gold)
  const headY = cy - scale * 0.1;
  const headR = scale * 0.22;
  drawFilledCircle(buf, width, height, cx, headY, headR, GOLD_500);

  // Location Pin Tail (Triangle tapering to bottom point)
  const tipY = cy + scale * 0.3;
  const topY = headY + headR * 0.35;
  for (let y = Math.floor(topY); y <= Math.ceil(tipY); y++) {
    const progress = (y - topY) / Math.max(1, tipY - topY);
    const halfW = headR * 0.92 * (1 - Math.pow(progress, 0.85));
    for (let x = Math.floor(cx - halfW - 1); x <= Math.ceil(cx + halfW + 1); x++) {
      const distEdge = halfW - Math.abs(x - cx);
      const aa = Math.max(0, Math.min(1, distEdge + 0.5));
      blendPixel(buf, width, height, x, y, GOLD_500, aa);
    }
  }

  // Inner Navy Core & Gold Center Dot (Pulse Node)
  drawFilledCircle(buf, width, height, cx, headY, headR * 0.48, NAVY_900);
  drawFilledCircle(buf, width, height, cx, headY, headR * 0.2, GOLD_500);
}

function createIconPng(size, maskable = false) {
  const buf = Buffer.alloc(size * size * 4);
  fillBackground(buf, size, size, NAVY_900, NAVY_950);
  if (!maskable) {
    // Subtle gold inner border frame
    drawRing(buf, size, size, size / 2, size / 2, size * 0.46, Math.max(1.5, size * 0.015), GOLD_500, 0.22);
  }
  const scale = maskable ? size * 0.68 : size * 0.82;
  drawPulsePinEmblem(buf, size, size, size / 2, size / 2, scale);
  return encodePng(size, size, buf);
}

function createSplashPng(width, height) {
  const buf = Buffer.alloc(width * height * 4);
  fillBackground(buf, width, height, NAVY_900, NAVY_950);

  // Subtle architectural campus grid lines
  const gridStep = Math.round(Math.min(width, height) * 0.08);
  for (let x = gridStep; x < width; x += gridStep) {
    for (let y = 0; y < height; y++) {
      blendPixel(buf, width, height, x, y, NAVY_700, 0.14);
    }
  }
  for (let y = gridStep; y < height; y += gridStep) {
    for (let x = 0; x < width; x += gridStep) {
      blendPixel(buf, width, height, x, y, NAVY_700, 0.14);
    }
  }

  // Center Emblem Card
  const cardSize = Math.round(Math.min(width, height) * 0.28);
  const cx = Math.round(width / 2);
  const cy = Math.round(height * 0.44);
  drawRoundedRect(
    buf,
    width,
    height,
    cx - cardSize / 2,
    cy - cardSize / 2,
    cardSize,
    cardSize,
    cardSize * 0.22,
    NAVY_950
  );
  drawPulsePinEmblem(buf, width, height, cx, cy, cardSize * 0.85);

  // Bottom Gold Accent Pill Bar ("UPSA PULSE · CAMPUS FEED")
  const pillW = Math.round(Math.min(width, height) * 0.42);
  const pillH = Math.max(10, Math.round(Math.min(width, height) * 0.016));
  drawRoundedRect(
    buf,
    width,
    height,
    cx - pillW / 2,
    cy + cardSize * 0.72,
    pillW,
    pillH,
    pillH / 2,
    GOLD_500
  );
  return encodePng(width, height, buf);
}

function createScreenshotPng(width, height, isWide = false) {
  const buf = Buffer.alloc(width * height * 4);
  fillBackground(buf, width, height, BG_PAPER, NAVY_100);

  // Top Navy Header Bar
  const headerH = Math.round(height * (isWide ? 0.14 : 0.1));
  drawRoundedRect(buf, width, height, 0, 0, width, headerH, 0, NAVY_900);
  drawPulsePinEmblem(buf, width, height, headerH * 0.6, headerH * 0.5, headerH * 0.65);

  // Gold active tab underline
  drawRoundedRect(buf, width, height, headerH * 1.2, headerH - 6, width * 0.22, 6, 3, GOLD_500);

  // Feed Post Cards Preview
  const colW = isWide ? Math.round(width * 0.62) : Math.round(width * 0.88);
  const startX = Math.round((width - colW) / 2);
  const cardCount = 3;
  const cardH = Math.round((height - headerH * 1.8) / cardCount - 18);

  for (let i = 0; i < cardCount; i++) {
    const y = Math.round(headerH * 1.25 + i * (cardH + 18));
    drawRoundedRect(buf, width, height, startX, y, colW, cardH, 16, WHITE);
    // Left vote rail
    drawRoundedRect(buf, width, height, startX + 18, y + 18, 44, cardH - 36, 10, NAVY_100);
    // Gold Ask/OP chip
    drawRoundedRect(buf, width, height, startX + 80, y + 22, 130, 26, 13, i === 0 ? GOLD_500 : NAVY_100);
    // Content lines
    drawRoundedRect(buf, width, height, startX + 80, y + 64, colW - 110, 16, 8, NAVY_900);
    drawRoundedRect(buf, width, height, startX + 80, y + 92, colW - 180, 14, 7, NAVY_700);
  }

  // Floating Gold Compose Button
  drawFilledCircle(buf, width, height, width / 2, height - headerH * 0.45, 34, GOLD_500);
  return encodePng(width, height, buf);
}

function createOgBannerPng(width, height) {
  const buf = Buffer.alloc(width * height * 4);
  fillBackground(buf, width, height, NAVY_900, NAVY_950);
  drawRing(buf, width, height, width * 0.24, height * 0.5, height * 0.42, 4, GOLD_500, 0.25);
  drawPulsePinEmblem(buf, width, height, Math.round(width * 0.24), Math.round(height * 0.5), height * 0.62);

  // Right side editorial card preview bars
  const rightX = Math.round(width * 0.46);
  drawRoundedRect(buf, width, height, rightX, Math.round(height * 0.24), Math.round(width * 0.44), 38, 10, GOLD_500);
  drawRoundedRect(buf, width, height, rightX, Math.round(height * 0.36), Math.round(width * 0.36), 22, 8, WHITE);
  drawRoundedRect(buf, width, height, rightX, Math.round(height * 0.48), Math.round(width * 0.42), 140, 16, NAVY_700);
  drawRoundedRect(buf, width, height, rightX + 24, Math.round(height * 0.53), 120, 28, 14, GOLD_100);
  return encodePng(width, height, buf);
}

// 1. Write PNG Icons
fs.writeFileSync(path.join(publicDir, 'icons/favicon-32x32.png'), createIconPng(32, false));
fs.writeFileSync(path.join(publicDir, 'icons/badge-72x72.png'), createIconPng(72, false));
fs.writeFileSync(path.join(publicDir, 'icons/apple-touch-icon.png'), createIconPng(180, false));
fs.writeFileSync(path.join(publicDir, 'icons/icon-192.png'), createIconPng(192, false));
fs.writeFileSync(path.join(publicDir, 'icons/icon-512.png'), createIconPng(512, false));
fs.writeFileSync(path.join(publicDir, 'icons/icon-maskable-512.png'), createIconPng(512, true));

// 2. Write iOS & Android PWA Splash Screens
fs.writeFileSync(path.join(publicDir, 'splash/apple-splash-750x1334.png'), createSplashPng(750, 1334));
fs.writeFileSync(path.join(publicDir, 'splash/apple-splash-1170x2532.png'), createSplashPng(1170, 2532));
fs.writeFileSync(path.join(publicDir, 'splash/apple-splash-1290x2796.png'), createSplashPng(1290, 2796));

// 3. Write OpenGraph & PWA Install Screenshots
fs.writeFileSync(path.join(publicDir, 'og-banner.png'), createOgBannerPng(1200, 630));
fs.writeFileSync(path.join(publicDir, 'screenshots/feed-mobile.png'), createScreenshotPng(1080, 1920, false));
fs.writeFileSync(path.join(publicDir, 'screenshots/places-wide.png'), createScreenshotPng(1280, 720, true));

// 4. Write Crisp SVG Brand Icons & Wordmarks
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="UPSA Pulse Brand Emblem">
  <defs>
    <linearGradient id="upsaNavy" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0B2A5B"/>
      <stop offset="100%" stop-color="#071C3D"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#upsaNavy)"/>
  <circle cx="256" cy="224" r="190" fill="none" stroke="#D9A21B" stroke-width="8" stroke-opacity="0.22"/>
  <circle cx="256" cy="224" r="148" fill="none" stroke="#D9A21B" stroke-width="10" stroke-opacity="0.42"/>
  <path d="M256 96c-70.7 0-128 57.3-128 128 0 89.8 110.8 176.8 121.6 185.1a10.5 10.5 0 0 0 12.8 0C273.2 400.8 384 313.8 384 224c0-70.7-57.3-128-128-128z" fill="#D9A21B"/>
  <circle cx="256" cy="224" r="56" fill="#0B2A5B"/>
  <circle cx="256" cy="224" r="22" fill="#D9A21B"/>
</svg>`;

const logoMarkSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="UPSA Pulse Mark">
  <rect width="128" height="128" rx="28" fill="#0B2A5B"/>
  <circle cx="64" cy="56" r="44" fill="none" stroke="#D9A21B" stroke-width="3" stroke-opacity="0.38"/>
  <path d="M64 24c-17.7 0-32 14.3-32 32 0 22.5 27.7 44.2 30.4 46.3a2.6 2.6 0 0 0 3.2 0C68.3 100.2 96 78.5 96 56c0-17.7-14.3-32-32-32z" fill="#D9A21B"/>
  <circle cx="64" cy="56" r="14" fill="#0B2A5B"/>
  <circle cx="64" cy="56" r="5.5" fill="#D9A21B"/>
</svg>`;

const logoFullSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 96" role="img" aria-label="UPSA Pulse Campus Feed Logo">
  <rect x="4" y="8" width="80" height="80" rx="20" fill="#0B2A5B"/>
  <circle cx="44" cy="43" r="29" fill="none" stroke="#D9A21B" stroke-width="2.5" stroke-opacity="0.4"/>
  <path d="M44 21c-12.2 0-22 9.8-22 22 0 15.4 19 30.3 20.9 31.8a1.8 1.8 0 0 0 2.2 0C47 73.3 66 58.4 66 43c0-12.2-9.8-22-22-22z" fill="#D9A21B"/>
  <circle cx="44" cy="43" r="9.5" fill="#0B2A5B"/>
  <circle cx="44" cy="43" r="3.8" fill="#D9A21B"/>
  <text x="102" y="47" font-family="Figtree, system-ui, -apple-system, sans-serif" font-size="30" font-weight="800" fill="#0B2A5B" letter-spacing="-0.5">UPSA Pulse</text>
  <rect x="282" y="24" width="124" height="26" rx="13" fill="#D9A21B"/>
  <text x="344" y="41" text-anchor="middle" font-family="Figtree, system-ui, sans-serif" font-size="12" font-weight="800" fill="#0B2A5B" letter-spacing="0.6">CAMPUS PWA</text>
  <text x="102" y="72" font-family="Figtree, system-ui, -apple-system, sans-serif" font-size="14" font-weight="600" fill="#5B6678">Main Campus · Hostel A · Hostel B · Hostel C</text>
</svg>`;

fs.writeFileSync(path.join(publicDir, 'icon.svg'), iconSvg);
fs.writeFileSync(path.join(publicDir, 'logo-mark.svg'), logoMarkSvg);
fs.writeFileSync(path.join(publicDir, 'logo-full.svg'), logoFullSvg);

// 5. Copy AI-generated brand emblem & campus hero illustrations if present in artifact dir
const artifactDir = 'C:\\Users\\Dell\\.gemini\\antigravity\\brain\\5c33f680-8183-4e80-b559-3c39d46bcb17';
const emblemSrc = path.join(artifactDir, 'upsa_pulse_emblem_1793808565458.jpg');
const heroSrc = path.join(artifactDir, 'upsa_pulse_campus_hero_1793808619264.jpg');
if (fs.existsSync(emblemSrc)) {
  fs.copyFileSync(emblemSrc, path.join(publicDir, 'images/upsa-pulse-emblem.jpg'));
}
if (fs.existsSync(heroSrc)) {
  fs.copyFileSync(heroSrc, path.join(publicDir, 'images/upsa-pulse-campus-hero.jpg'));
}

console.log('[PWA ASSETS] Generated all icons, splash screens, screenshots, and SVG logos in public/');
