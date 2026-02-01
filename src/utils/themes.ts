export type Theme = {
  bg: string;
  title: string;
  text: string;
  icon: string;
  border: string;
};

export const themes: Record<string, Theme> = {
  default: { bg: "fffefe", title: "2f80ed", text: "434d58", icon: "4c71f2", border: "e4e2e2" },
  dark: { bg: "151515", title: "fff", text: "9f9f9f", icon: "79ff97", border: "2a2a2a" },
  radical: { bg: "141321", title: "fe428e", text: "a9fef7", icon: "f8d847", border: "2a2a40" },
  merko: { bg: "0a0f0b", title: "abd200", text: "68b587", icon: "b7d364", border: "1a2f1a" },
  gruvbox: { bg: "282828", title: "fabd2f", text: "ebdbb2", icon: "fe8019", border: "3c3836" },
  tokyonight: { bg: "1a1b27", title: "70a5fd", text: "38bdae", icon: "bf91f3", border: "2a2b3d" },
  onedark: { bg: "282c34", title: "e4bf7a", text: "abb2bf", icon: "8eb573", border: "3e4451" },
  cobalt: { bg: "193549", title: "e683d9", text: "75eeb2", icon: "0480ef", border: "2a4a6a" },
  synthwave: { bg: "2b213a", title: "e2e9ec", text: "e5289e", icon: "ef8539", border: "3e2f5a" },
  highcontrast: { bg: "000", title: "e7f216", text: "fff", icon: "00ffff", border: "333" },
  dracula: { bg: "282a36", title: "ff6e96", text: "f8f8f2", icon: "bd93f9", border: "44475a" },
  monokai: { bg: "272822", title: "f92672", text: "f8f8f2", icon: "a6e22e", border: "3e3d32" },
  nord: { bg: "2e3440", title: "88c0d0", text: "d8dee9", icon: "81a1c1", border: "3b4252" },
  github_dark: { bg: "0d1117", title: "58a6ff", text: "c9d1d9", icon: "1f6feb", border: "21262d" },
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
