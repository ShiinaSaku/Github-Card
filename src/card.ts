import { resolveColors, kFormat, escapeXml, icon } from "@/utils";
import type { UserProfile, UserStats, LanguageStat, CardOptions } from "@/types";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Font loading logic
let fontBase64 = "";
try {
  const _dirname =
    typeof import.meta.dir !== "undefined"
      ? import.meta.dir
      : dirname(fileURLToPath(import.meta.url));
  const fontPath = join(_dirname, "../fonts/GoogleSans-VariableFont_GRAD,opsz,wght.ttf");
  // readFileSync works fine in Bun for startup config
  fontBase64 = readFileSync(fontPath).toString("base64");
} catch (e) {
  // Silent fallback to system fonts
}

export type CardOpts = {
  theme?: string;
  title_color?: string;
  text_color?: string;
  icon_color?: string;
  bg_color?: string;
  border_color?: string;
  hide_border?: boolean;
};

export function renderCard(
  user: UserProfile,
  stats: UserStats,
  langs: LanguageStat[],
  opts: CardOpts = {},
): string {
  const c = resolveColors(opts);
  const hideBorder = opts.hide_border ?? false;

  const name = escapeXml(user.name || user.login);
  const uname = escapeXml(user.login);
  const bio = user.bio ? escapeXml(user.bio).slice(0, 48) : "";
  const pronouns = user.pronouns ? escapeXml(user.pronouns) : "";
  const avatar = user.avatarUrl.replace(/&/g, "&amp;");
  const twitter = user.twitter ? escapeXml(user.twitter) : "";

  const W = 460;
  const H = 195;
  const P = 25;
  const avatarSize = 70;
  const barWidth = W - P * 2;
  const barY = H - 42;
  const labelY = H - 18;
  const infoX = P + avatarSize + 16;

  const totalSize = langs.reduce((sum, l) => sum + l.size, 0) || 1;
  let offset = 0;
  const langRects = langs
    .map((lang) => {
      const w = (lang.size / totalSize) * barWidth;
      const r = `<rect x="${P + offset}" y="${barY}" width="${w}" height="8" fill="${lang.color}"/>`;
      offset += w;
      return r;
    })
    .join("");

  const labelSpacing = Math.floor(barWidth / Math.max(langs.length, 1));
  const langLabels = langs
    .map((lang, i) => {
      const pct = ((lang.size / totalSize) * 100).toFixed(0);
      const maxLen = Math.max(6, Math.floor(labelSpacing / 8) - 4);
      const display = lang.name.length > maxLen ? lang.name.slice(0, maxLen) + "…" : lang.name;
      return `<circle cx="${P + i * labelSpacing + 5}" cy="${labelY}" r="4" fill="${lang.color}"/><text x="${P + i * labelSpacing + 13}" y="${labelY + 4}" class="lang">${display} ${pct}%</text>`;
    })
    .join("");

  const nameY = P + 22;
  const usernameY = nameY + 17;
  const bioY = usernameY + 15;
  const twitterY = bio ? bioY + 13 : usernameY + 15;

  const fontCSS = fontBase64
    ? `@font-face{font-family:'Google Sans';src:url(data:font/ttf;base64,${fontBase64}) format('truetype');}`
    : "";
  const fontFamily = fontBase64 ? "'Google Sans'" : "'Segoe UI',Ubuntu,sans-serif";

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <title>${name}'s GitHub Stats</title>
    <defs>
      <clipPath id="a"><circle cx="${P + avatarSize / 2}" cy="${P + avatarSize / 2}" r="${avatarSize / 2}"/></clipPath>
      <clipPath id="b"><rect x="${P}" y="${barY}" width="${barWidth}" height="8" rx="4"/></clipPath>
    </defs>
    <style>
      ${fontCSS}
      *{font-family:${fontFamily},sans-serif}
      .bg{fill:#${c.bg}}
      .title{font-size:18px;font-weight:700;fill:#${c.title}}
      .user{font-size:12px;fill:#${c.text};opacity:.7}
      .bio{font-size:11px;fill:#${c.text};opacity:.6}
      .tw{font-size:11px;fill:#${c.text};opacity:.7}
      .stat{font-size:14px;font-weight:700;fill:#${c.text}}
      .lang{font-size:10px;fill:#${c.text}}
      .sec{font-size:9px;font-weight:600;fill:#${c.text};opacity:.5;text-transform:uppercase;letter-spacing:.5px}
    </style>
    <rect class="bg" width="${W}" height="${H}" rx="8" stroke="${hideBorder ? "none" : `#${c.border}`}" stroke-width="1"/>
    <circle cx="${P + avatarSize / 2}" cy="${P + avatarSize / 2}" r="${avatarSize / 2 + 3}" fill="none" stroke="#${c.icon}" stroke-width="2" opacity=".25"/>
    <image href="${avatar}" x="${P}" y="${P}" width="${avatarSize}" height="${avatarSize}" clip-path="url(#a)"/>
    <text x="${infoX}" y="${nameY}" class="title">${name}</text>
    <text x="${infoX}" y="${usernameY}" class="user">@${uname}${pronouns ? ` · ${pronouns}` : ""}</text>
    ${bio ? `<text x="${infoX}" y="${bioY}" class="bio">${bio}</text>` : ""}
    ${twitter ? `<g transform="translate(${infoX},${twitterY - 9})">${icon("x", c.icon, 11)}<text x="14" y="9" class="tw">@${twitter}</text></g>` : ""}
    <g transform="translate(${P},${P + avatarSize + 16})">
      <g>${icon("star", c.icon, 16)}<text x="20" y="12" class="stat">${kFormat(stats.stars)}</text></g>
      <g transform="translate(70,0)">${icon("commit", c.icon, 16)}<text x="20" y="12" class="stat">${kFormat(stats.commits)}</text></g>
      <g transform="translate(140,0)">${icon("pr", c.icon, 16)}<text x="20" y="12" class="stat">${kFormat(stats.prs)}</text></g>
      <g transform="translate(210,0)">${icon("issue", c.icon, 16)}<text x="20" y="12" class="stat">${kFormat(stats.issues)}</text></g>
      <g transform="translate(280,0)">${icon("repo", c.icon, 16)}<text x="20" y="12" class="stat">${kFormat(stats.repos)}</text></g>
    </g>
    <text x="${P}" y="${barY - 8}" class="sec">Top Languages</text>
    <rect x="${P}" y="${barY}" width="${barWidth}" height="8" rx="4" fill="#${c.text}" opacity=".1"/>
    <g clip-path="url(#b)">${langRects}</g>
    ${langLabels}
  </svg>`;
}
