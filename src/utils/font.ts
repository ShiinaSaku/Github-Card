/**
 * Roboto variable font embedded as base64 WOFF2 for SVG @font-face.
 *
 * The subset (~47KB / ~63KB base64) covers:
 *   - ASCII printable (U+0020-007E)
 *   - Latin-1 Supplement (U+00A0-00FF)
 *   - Common typographic chars (dashes, quotes, ellipsis, bullets)
 *   - Variable weight axis (400-700)
 *
 * Loaded once at startup via Bun.file — zero per-request cost.
 */

const fontPath = new URL("../../fonts/Roboto-subset.woff2", import.meta.url).pathname;
const fontBytes = await Bun.file(fontPath).arrayBuffer();
const fontBase64 = Buffer.from(fontBytes).toString("base64");

export const FONT_FAMILY = "'Roboto', sans-serif";

export const FONT_FACE = `@font-face{font-family:'Roboto';font-style:normal;font-weight:100 900;font-display:swap;src:url(data:font/woff2;base64,${fontBase64}) format('woff2')}`;
