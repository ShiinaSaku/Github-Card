export const icons = {
  star: `<path d="M10.92 2.868a1.25 1.25 0 0 1 2.16 0l2.795 4.798l5.428 1.176a1.25 1.25 0 0 1 .667 2.054l-3.7 4.141l.56 5.525a1.25 1.25 0 0 1-1.748 1.27L12 19.592l-5.082 2.24a1.25 1.25 0 0 1-1.748-1.27l.56-5.525l-3.7-4.14a1.25 1.25 0 0 1 .667-2.055l5.428-1.176z"/>`,
  commit: `<path fill-rule="evenodd" d="M10.5 7.75a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zm1.43.75a4.002 4.002 0 01-7.86 0H.75a.75.75 0 110-1.5h3.32a4.001 4.001 0 017.86 0h3.32a.75.75 0 110 1.5h-3.32z"/>`,
  pr: `<path d="M4 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0M4 6a2 2 0 1 0 4 0a2 2 0 1 0-4 0m12 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0M6 8v8"/><path d="M11 6h5a2 2 0 0 1 2 2v8"/><path d="m14 9l-3-3l3-3"/>`,
  issue: `<path d="M15.314 2a2 2 0 0 1 1.414.586l4.686 4.686A2 2 0 0 1 22 8.686v6.628a2 2 0 0 1-.586 1.414l-4.686 4.686a2 2 0 0 1-1.414.586H8.686a2 2 0 0 1-1.414-.586l-4.686-4.686A2 2 0 0 1 2 15.314V8.686a2 2 0 0 1 .586-1.414l4.686-4.686A2 2 0 0 1 8.686 2zm0 2H8.686L4 8.686v6.628L8.686 20h6.628L20 15.314V8.686zM12 15a1 1 0 1 1 0 2a1 1 0 0 1 0-2m0-9a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0V7a1 1 0 0 1 1-1"/>`,
  repo: `<path d="M6 19.623c-.69-.195-1.232-.491-1.682-.941C3 17.364 3 15.242 3 11s0-6.364 1.318-7.682S7.758 2 12 2s6.364 0 7.682 1.318S21 6.758 21 11s0 6.364-1.318 7.682c-.45.45-.993.746-1.682.941"/><path d="M12 20.193c-.414 0-.748.32-1.414.958c-.647.619-.97.929-1.242.831a.5.5 0 0 1-.096-.046C9 21.779 9 21.31 9 20.376v-3.125c0-1.532 0-2.299.44-2.775C9.878 14 10.585 14 12 14s2.121 0 2.56.476s.44 1.243.44 2.775v3.125c0 .935 0 1.403-.248 1.56a.5.5 0 0 1-.096.046c-.272.098-.595-.212-1.242-.831c-.666-.639-1-.958-1.414-.958M8 10h8M8 6h4"/>`,
  x: `<path d="M4 4l11.733 16h4.267l-11.733 -16l-4.267 0" /><path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772" />`,
};

type IconName = keyof typeof icons;

const iconMeta: Record<
  IconName,
  { viewBox: string; kind: "fill" | "stroke"; strokeWidth?: string }
> = {
  star: { viewBox: "0 0 24 24", kind: "fill" },
  commit: { viewBox: "0 0 16 16", kind: "fill" },
  pr: { viewBox: "0 0 24 24", kind: "stroke", strokeWidth: "2" },
  issue: { viewBox: "0 0 24 24", kind: "fill" },
  repo: { viewBox: "0 0 24 24", kind: "stroke", strokeWidth: "1.5" },
  x: { viewBox: "0 0 24 24", kind: "stroke", strokeWidth: "2" },
};

export function icon(name: IconName, color: string, size = 16): string {
  const path = icons[name];
  if (!path) return "";
  const meta = iconMeta[name];
  const viewBox = meta?.viewBox ?? "0 0 16 16";
  const colorStr = color.startsWith("#") ? color : `#${color}`;
  const attrs =
    meta?.kind === "stroke"
      ? `fill="none" stroke="${colorStr}" stroke-width="${meta.strokeWidth ?? "1.8"}" stroke-linecap="round" stroke-linejoin="round"`
      : `fill="${colorStr}"`;
  return `<svg width="${size}" height="${size}" viewBox="${viewBox}" ${attrs} role="img">${path}</svg>`;
}
