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
  const factor = size;
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
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff\ud800-\udfff]/gu, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function wrapText(input: string, maxLen: number, maxLines: number): string[] {
  if (maxLen < 1 || maxLines < 1) return [];
  let remaining = Array.from(input.trim().replace(/\s+/g, " "));
  const lines: string[] = [];

  while (remaining.length && lines.length < maxLines) {
    if (remaining.length <= maxLen) {
      lines.push(remaining.join(""));
      break;
    }
    if (lines.length === maxLines - 1) {
      lines.push(
        remaining
          .slice(0, maxLen - 1)
          .join("")
          .trimEnd() + "…",
      );
      break;
    }
    const space = remaining.lastIndexOf(" ", maxLen);
    const end = space > 0 ? space : maxLen;
    lines.push(remaining.slice(0, end).join(""));
    remaining = remaining.slice(end);
    if (remaining[0] === " ") remaining.shift();
  }
  return lines;
}
