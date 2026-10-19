/**
 * Generates every app icon from the single source file `public/logo.svg`:
 *   public/favicon.svg                    tab icon, cropped to the tile
 *   public/icons/icon-192.png             PWA "any"
 *   public/icons/icon-512.png             PWA "any"
 *   public/icons/icon-512-maskable.png    Android adaptive, opaque full bleed
 *   public/icons/apple-touch-icon.png     iPhone home screen (180px)
 *
 * Run `npm run icons` after changing the logo. Outputs are committed, so
 * builds and deploys never need this script.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const iconsDir = path.join(publicDir, "icons");

const source = await readFile(path.join(publicDir, "logo.svg"), "utf8");
const inner = source
  .replace(/^[\s\S]*?<svg[^>]*>/, "")
  .replace(/<\/svg>\s*$/, "");

/** The tile drawn by logo.svg sits at x/y 32 with size 448 (viewBox 512). */
const TILE = { x: 32, y: 32, size: 448 };

/** Cropped to the tile: the version that reads well at favicon sizes. */
function croppedSvg() {
  const { x, y, size } = TILE;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="${x} ${y} ${size} ${size}">`,
    inner,
    "</svg>",
  ].join("");
}

/**
 * Cropped and backed by an opaque square, so launcher masks (Android
 * circles/squircles, iOS squircles) never reveal transparent corners.
 */
function fullBleedSvg() {
  const { x, y, size } = TILE;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="${x} ${y} ${size} ${size}">`,
    `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#09090a" />`,
    inner,
    "</svg>",
  ].join("");
}

function png(svg, width) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: { loadSystemFonts: true, defaultFontFamily: "Arial" },
  });
  return resvg.render().asPng();
}

await mkdir(iconsDir, { recursive: true });

await writeFile(path.join(publicDir, "favicon.svg"), croppedSvg());
await writeFile(path.join(iconsDir, "icon-192.png"), png(source, 192));
await writeFile(path.join(iconsDir, "icon-512.png"), png(source, 512));
await writeFile(
  path.join(iconsDir, "icon-512-maskable.png"),
  png(fullBleedSvg(), 512)
);
await writeFile(
  path.join(iconsDir, "apple-touch-icon.png"),
  png(fullBleedSvg(), 180)
);

console.log("Icons generated from public/logo.svg:");
console.log("  public/favicon.svg");
console.log("  public/icons/icon-192.png");
console.log("  public/icons/icon-512.png");
console.log("  public/icons/icon-512-maskable.png");
console.log("  public/icons/apple-touch-icon.png");
