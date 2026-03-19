export type Theme = {
  bg: string;
  title: string;
  text: string;
  icon: string;
  border: string;
};

export const themes: Record<string, Theme> = {
  default: {
    bg: "fill-white",
    title: "fill-blue-600",
    text: "fill-slate-700",
    icon: "fill-blue-500",
    border: "stroke-slate-200",
  },
  dark: {
    bg: "fill-zinc-900",
    title: "fill-white",
    text: "fill-zinc-400",
    icon: "fill-emerald-400",
    border: "stroke-zinc-800",
  },
  radical: {
    bg: "fill-slate-900",
    title: "fill-pink-500",
    text: "fill-cyan-300",
    icon: "fill-yellow-400",
    border: "stroke-slate-800",
  },
  merko: {
    bg: "fill-neutral-950",
    title: "fill-lime-400",
    text: "fill-emerald-400",
    icon: "fill-lime-300",
    border: "stroke-neutral-800",
  },
  gruvbox: {
    bg: "fill-stone-800",
    title: "fill-amber-400",
    text: "fill-stone-300",
    icon: "fill-orange-500",
    border: "stroke-stone-700",
  },
  tokyonight: {
    bg: "fill-slate-900",
    title: "fill-blue-400",
    text: "fill-teal-400",
    icon: "fill-fuchsia-400",
    border: "stroke-slate-800",
  },
  onedark: {
    bg: "fill-slate-800",
    title: "fill-amber-300",
    text: "fill-slate-400",
    icon: "fill-green-400",
    border: "stroke-slate-700",
  },
  cobalt: {
    bg: "fill-sky-950",
    title: "fill-fuchsia-400",
    text: "fill-emerald-300",
    icon: "fill-blue-500",
    border: "stroke-sky-900",
  },
  synthwave: {
    bg: "fill-purple-950",
    title: "fill-slate-200",
    text: "fill-pink-500",
    icon: "fill-orange-400",
    border: "stroke-purple-900",
  },
  highcontrast: {
    bg: "fill-black",
    title: "fill-yellow-300",
    text: "fill-white",
    icon: "fill-cyan-400",
    border: "stroke-zinc-800",
  },
  dracula: {
    bg: "fill-slate-900",
    title: "fill-pink-400",
    text: "fill-slate-100",
    icon: "fill-purple-400",
    border: "stroke-slate-700",
  },
  monokai: {
    bg: "fill-zinc-900",
    title: "fill-pink-500",
    text: "fill-zinc-100",
    icon: "fill-lime-400",
    border: "stroke-zinc-800",
  },
  nord: {
    bg: "fill-slate-800",
    title: "fill-cyan-400",
    text: "fill-slate-300",
    icon: "fill-blue-400",
    border: "stroke-slate-700",
  },
  github_dark: {
    bg: "fill-slate-900",
    title: "fill-blue-400",
    text: "fill-slate-300",
    icon: "fill-blue-500",
    border: "stroke-slate-800",
  },
  pearl: {
    bg: "fill-slate-50",
    title: "fill-slate-900",
    text: "fill-slate-600",
    icon: "fill-blue-600",
    border: "stroke-slate-200",
  },
  slate: {
    bg: "fill-slate-950",
    title: "fill-slate-200",
    text: "fill-slate-400",
    icon: "fill-sky-400",
    border: "stroke-slate-800",
  },
  forest: {
    bg: "fill-emerald-950",
    title: "fill-emerald-200",
    text: "fill-emerald-400",
    icon: "fill-emerald-500",
    border: "stroke-emerald-900",
  },
  rose: {
    bg: "fill-rose-950",
    title: "fill-rose-200",
    text: "fill-rose-300",
    icon: "fill-rose-400",
    border: "stroke-rose-900",
  },
  sand: {
    bg: "fill-orange-50",
    title: "fill-amber-900",
    text: "fill-amber-700",
    icon: "fill-amber-600",
    border: "stroke-orange-200",
  },
  shiina: {
    title: "fill-pink-400",
    text: "fill-slate-100",
    icon: "fill-sky-400",
    bg: "#0B0C10",
    border: "stroke-slate-800",
  },
  aurora: {
    title: "fill-emerald-300",
    text: "fill-slate-100",
    icon: "fill-teal-400",
    bg: "#020617",
    border: "stroke-emerald-900",
  },
  oled: {
    title: "fill-rose-400",
    text: "fill-zinc-400",
    icon: "fill-indigo-400",
    bg: "#000000",
    border: "stroke-zinc-900",
  },
};

export function resolveColors(opts: {
  theme?: string;
  bg_color?: string;
  title_color?: string;
  text_color?: string;
  icon_color?: string;
  border_color?: string;
}): Theme {
  const base = (opts.theme && themes[opts.theme]) || themes.default!;
  return {
    bg: opts.bg_color || base.bg,
    title: opts.title_color || base.title,
    text: opts.text_color || base.text,
    icon: opts.icon_color || base.icon,
    border: opts.border_color || base.border,
  };
}
