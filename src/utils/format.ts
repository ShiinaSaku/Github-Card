export function kFormat(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(num);
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
  for (const w of words) {
    const next = current ? `${current} ${w}` : w;
    if (next.length <= maxLen) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = w;
    if (lines.length >= maxLines - 1) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === 0 && input) lines.push(input.slice(0, maxLen));
  if (lines.length === maxLines && words.length > 0) {
    const last = lines[lines.length - 1];
    if (!last) return lines;
    if (last.length > maxLen) {
      lines[lines.length - 1] = last.slice(0, Math.max(0, maxLen - 1)) + "…";
    } else if (words.join(" ").length > lines.join(" ").length) {
      lines[lines.length - 1] = last.slice(0, Math.max(0, maxLen - 1)) + "…";
    }
  }
  return lines;
}
