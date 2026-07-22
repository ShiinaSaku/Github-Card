export function kFormat(num: number): string {
  const trim = (v: number) => v.toFixed(1).replace(/\.0$/, "");
  if (num >= 999_950) return trim(num / 1_000_000) + "M";
  if (num >= 999.95) return trim(num / 1_000) + "k";
  return String(Math.round(num));
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
