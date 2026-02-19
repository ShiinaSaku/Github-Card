/**
 * github-card — npm entry point
 *
 * Re-exports the pure SVG renderer, all themes, types, and utility functions.
 * No server dependency — works in any JS/TS runtime.
 */

// Core renderer
export { renderCard, type CardOpts } from "./card";

// Types
export type { UserProfile, UserStats, LanguageStat, ProfileData, CardOptions } from "./types";

// Theming
export { themes, resolveColors, type Theme } from "./utils/themes";

// Utilities
export { kFormat, escapeXml, wrapText } from "./utils/format";
export { icons, icon } from "./utils/icons";
export { getLangColor } from "./utils/languages";
export { FONT_FACE, FONT_FAMILY } from "./utils/font";
