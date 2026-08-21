export function kFormat(num: number): string {
  const sign = num < 0 ? "-" : "";
  const abs = Math.abs(num);
  const trim = (v: number) => v.toFixed(1).replace(/\.0$/, "");
  if (abs >= 999_950_000) return sign + trim(abs / 1_000_000_000) + "B";
  if (abs >= 999_950) return sign + trim(abs / 1_000_000) + "M";
  if (abs >= 999.95) return sign + trim(abs / 1_000) + "k";
  return sign + String(Math.round(abs));
}

/**
 * Approximate rendered width of a string in SVG user units for the default
 * sans-serif stack. Widths are per-character averages tuned to the card's
 * font sizes and weights, so layout can reserve enough space without relying
 * on browser text measurement (which is unavailable server-side).
 */
export function measureText(text: string, size: number, weight = 400): number {
  if (!text) return 0;
  const factor = size / 16;
  const weightFactor = weight >= 700 ? 1.08 : weight >= 600 ? 1.04 : 1;
  let width = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    let w: number;
    if (ch === " ") w = 0.28;
    else if (ch === "." || ch === "," || ch === ":" || ch === ";") w = 0.3;
    else if (ch === "i" || ch === "l" || ch === "I" || ch === "t" || ch === "j" || ch === "|")
      w = 0.3;
    else if (ch === "m" || ch === "w" || ch === "W" || ch === "M" || ch === "@") w = 0.95;
    else if (code >= 0x1100 && code <= 0x11ff)
      w = 1.0; // Hangul
    else if (code >= 0x4e00 && code <= 0x9fff)
      w = 1.0; // CJK
    else if (code >= 0x3040 && code <= 0x30ff)
      w = 1.0; // Kana
    else if (code >= 0xac00 && code <= 0xd7af)
      w = 1.0; // Hangul syllables
    else if (code > 0x7f)
      w = 0.72; // other non-ASCII (emoji, accents)
    else w = 0.58; // default latin
    width += w;
  }
  return width * factor * weightFactor;
}

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function wrapText(input: string, maxLen: number, maxLines: number): string[] {
  const words = input.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxLen) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    if (lines.length === maxLines) break;
    current = word.length > maxLen ? word.slice(0, maxLen) : word;
  }
  if (current && lines.length < maxLines) lines.push(current);

  // Truncated? Mark the last line with an ellipsis.
  const consumed = lines.join(" ").length;
  if (lines.length > 0 && consumed < input.trim().length) {
    const last = lines[lines.length - 1]!;
    lines[lines.length - 1] =
      (last.length >= maxLen ? last.slice(0, Math.max(0, maxLen - 1)) : last) + "…";
  }
  return lines;
}
