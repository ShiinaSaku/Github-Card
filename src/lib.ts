/**
 * github-card — npm entry point
 *
 * Re-exports the pure SVG renderer, all themes, types, and utility functions.
 * No server dependency — works in any JS/TS runtime.
 */

// Core renderer
export { renderCard, type CardOpts } from "./card.js";

// Types
export type { UserProfile, UserStats, LanguageStat, ProfileData, CardOptions } from "./types.js";

// Theming
export { themes, resolveColors, type Theme } from "./utils/themes.js";

// Utilities
export { kFormat, escapeXml, wrapText, measureText } from "./utils/format.js";
export { icons, icon } from "./utils/icons.js";
export { getLangColor } from "./utils/languages.js";
export { FONT_FACE, FONT_FAMILY } from "./utils/font.js";
