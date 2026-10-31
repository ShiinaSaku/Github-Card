import { renderCard, type CardOpts } from "./card";
import type { LanguageStat, UserProfile, UserStats } from "./types";
import { escapeXml, themes } from "./utils";

/** Inline SVG cards so the preview also works through GitHub's image proxy. */
export function renderThemeGallery(
  user: UserProfile,
  stats: UserStats,
  languages: LanguageStat[],
  options: CardOpts = {},
): string {
  const cards = Object.keys(themes).map((theme) => {
    const svg = renderCard(user, stats, languages, { ...options, theme, idPrefix: theme });
    // Dimensions come from our renderer, not user-supplied SVG.
    const [, width, height] = svg.match(/^<svg\b[^>]*\bviewBox="0 0 (\d+) (\d+)"/) ?? [];
    if (!width || !height) throw new Error("Card renderer returned an invalid viewBox");
    return { theme, svg, width: Number(width), height: Number(height) };
  });
  const columns = 2;
  const gap = 20;
  const labelHeight = 22;
  const cardWidth = Math.max(...cards.map((card) => card.width));
  const cellHeight = Math.max(...cards.map((card) => card.height)) + labelHeight;
  const rows = Math.ceil(cards.length / columns);
  const width = columns * cardWidth + (columns + 1) * gap;
  const height = rows * cellHeight + (rows + 1) * gap;

  const blocks = cards.map(({ theme, svg }, index) => {
    const x = gap + (index % columns) * (cardWidth + gap);
    const y = gap + Math.floor(index / columns) * (cellHeight + gap) + labelHeight;
    const card = svg.replace(/^<svg\b/, `<svg x="${x}" y="${y}"`);
    const label = `<text x="${x + 4}" y="${y - 8}" fill="#e2e8f0" font-size="13" font-family="system-ui,sans-serif" font-weight="700">${escapeXml(theme)}</text>`;
    return label + card;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="GitHub Card themes for user"><rect width="100%" height="100%" fill="#0b1220"/>${blocks.join("")}</svg>`;
}
