import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function readPngDimensions(filePath: string): { width: number; height: number } {
  const buf = fs.readFileSync(filePath);
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  expect(buf[0]).toBe(0x89);
  expect(buf[1]).toBe(0x50);
  expect(buf[2]).toBe(0x4e);
  expect(buf[3]).toBe(0x47);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

describe('PWA Icons, Splash Screens, Logos & Manifest Verification', () => {
  const publicDir = path.join(process.cwd(), 'public');

  it('has a complete PWA manifest with PNG icons, maskable icon, screenshots, and shortcuts', () => {
    const manifestPath = path.join(publicDir, 'manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    expect(manifest.name).toBe('UPSA Pulse');
    expect(manifest.short_name).toBe('Pulse');
    expect(manifest.theme_color).toBe('#0B2A5B');
    expect(manifest.background_color).toBe('#F7F8FB');
    expect(manifest.display).toBe('standalone');

    const iconSrcs = (manifest.icons ?? []).map((i: { src: string }) => i.src);
    expect(iconSrcs).toContain('/icons/icon-192.png');
    expect(iconSrcs).toContain('/icons/icon-512.png');
    expect(iconSrcs).toContain('/icons/icon-maskable-512.png');
    expect(Array.isArray(manifest.screenshots)).toBe(true);
    expect(manifest.screenshots.length).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(manifest.shortcuts)).toBe(true);
    expect(manifest.shortcuts.length).toBeGreaterThanOrEqual(2);
  });

  it('verifies all required PNG icons, splash screens, OpenGraph banner, and SVG logos exist with exact pixel dimensions', () => {
    const expectedPngs: Array<{ relPath: string; width: number; height: number }> = [
      { relPath: 'icons/favicon-32x32.png', width: 32, height: 32 },
      { relPath: 'icons/badge-72x72.png', width: 72, height: 72 },
      { relPath: 'icons/apple-touch-icon.png', width: 180, height: 180 },
      { relPath: 'icons/icon-192.png', width: 192, height: 192 },
      { relPath: 'icons/icon-512.png', width: 512, height: 512 },
      { relPath: 'icons/icon-maskable-512.png', width: 512, height: 512 },
      { relPath: 'splash/apple-splash-750x1334.png', width: 750, height: 1334 },
      { relPath: 'splash/apple-splash-1170x2532.png', width: 1170, height: 2532 },
      { relPath: 'splash/apple-splash-1290x2796.png', width: 1290, height: 2796 },
      { relPath: 'og-banner.png', width: 1200, height: 630 },
      { relPath: 'screenshots/feed-mobile.png', width: 1080, height: 1920 },
      { relPath: 'screenshots/places-wide.png', width: 1280, height: 720 },
    ];

    for (const item of expectedPngs) {
      const fullPath = path.join(publicDir, item.relPath);
      expect(fs.existsSync(fullPath), `Missing ${item.relPath}`).toBe(true);
      const dims = readPngDimensions(fullPath);
      expect(dims, `Dimensions mismatch for ${item.relPath}`).toEqual({
        width: item.width,
        height: item.height,
      });
    }

    expect(fs.existsSync(path.join(publicDir, 'icon.svg'))).toBe(true);
    expect(fs.existsSync(path.join(publicDir, 'logo-mark.svg'))).toBe(true);
    expect(fs.existsSync(path.join(publicDir, 'logo-full.svg'))).toBe(true);
    expect(fs.existsSync(path.join(publicDir, 'images/upsa-pulse-emblem.jpg'))).toBe(true);
    expect(fs.existsSync(path.join(publicDir, 'images/upsa-pulse-campus-hero.jpg'))).toBe(true);
  });
});
