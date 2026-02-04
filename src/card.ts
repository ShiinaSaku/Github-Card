import { resolveColors, kFormat, escapeXml, icon, wrapText } from "./utils";
import type { UserProfile, UserStats, LanguageStat } from "./types";

export type CardOpts = {
  theme?: string;
  title_color?: string;
  text_color?: string;
  icon_color?: string;
  bg_color?: string;
  border_color?: string;
  hide_border?: boolean;
  compact?: boolean;
};

export function renderCard(
  user: UserProfile,
  stats: UserStats,
  langs: LanguageStat[],
  opts: CardOpts = {},
): string {
  const c = resolveColors(opts);
  const hideBorder = opts.hide_border ?? false;
  const compact = opts.compact ?? false;

  const name = escapeXml(user.name || user.login);
  const uname = escapeXml(user.login);
  const bioRaw = !compact && user.bio ? escapeXml(user.bio) : "";
  const bioLines = bioRaw ? wrapText(bioRaw, 42, 2) : [];
  const pronouns = !compact && user.pronouns ? escapeXml(user.pronouns) : "";
  const avatarSource = user.avatarDataUrl || user.avatarUrl;
  const avatar = avatarSource.replace(/&/g, "&amp;");
  const twitter = !compact && user.twitter ? escapeXml(user.twitter) : "";

  const W = 500;
  const H = 200;
  const P = 22;
  const avatarSize = 72;
  const barWidth = W - P * 2;
  const barY = H - 40;
  const labelY = H - 16;
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

  const labelSpacing = compact ? 0 : Math.floor(barWidth / Math.max(langs.length, 1));
  const langLabels = compact
    ? ""
    : langs
        .map((lang, i) => {
          const pct = ((lang.size / totalSize) * 100).toFixed(0);
          return `<circle cx="${P + i * labelSpacing + 5}" cy="${labelY}" r="4" fill="${lang.color}"/><text x="${P + i * labelSpacing + 13}" y="${labelY + 4}" class="lang">${lang.name} ${pct}%</text>`;
        })
        .join("");

  const nameY = P + 22;
  const usernameY = nameY + 18;
  const bioY = usernameY + 14;
  const twitterY = bioLines.length ? bioY + 28 : usernameY + 16;

  const fontFamily =
    "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica Neue, Arial";
  const headerY = P + avatarSize + 12;
  const statLabelY = 28;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision" text-rendering="optimizeLegibility" image-rendering="optimizeQuality">
    <title>${name}'s GitHub Stats</title>
    <defs>
      <clipPath id="a"><circle cx="${P + avatarSize / 2}" cy="${P + avatarSize / 2}" r="${avatarSize / 2}"/></clipPath>
      <clipPath id="b"><rect x="${P}" y="${barY}" width="${barWidth}" height="8" rx="4"/></clipPath>
    </defs>
    <style>
      *{font-family:${fontFamily},sans-serif}
      .bg{fill:#${c.bg}}
      .title{font-size:18px;font-weight:700;fill:#${c.title}}
      .user{font-size:12px;fill:#${c.text};opacity:.7}
      ${compact ? "" : `.bio{font-size:11px;fill:#${c.text};opacity:.65}.tw{font-size:11px;fill:#${c.text};opacity:.7}.lang{font-size:10px;fill:#${c.text}}`}
      .stat{font-size:14px;font-weight:700;fill:#${c.text}}
      .stat-label{font-size:9px;font-weight:600;fill:#${c.text};opacity:.55;text-transform:uppercase;letter-spacing:.6px}
      .sec{font-size:9px;font-weight:600;fill:#${c.text};opacity:.5;text-transform:uppercase;letter-spacing:.6px}
    </style>
    <rect class="bg" width="${W}" height="${H}" rx="10" stroke="${hideBorder ? "none" : `#${c.border}`}" stroke-width="1"/>
    <circle cx="${P + avatarSize / 2}" cy="${P + avatarSize / 2}" r="${avatarSize / 2 + 2}" fill="none" stroke="#${c.border}" stroke-width="1" opacity=".6"/>
    <image href="${avatar}" x="${P}" y="${P}" width="${avatarSize}" height="${avatarSize}" clip-path="url(#a)"/>
    <text x="${infoX}" y="${nameY}" class="title">${name}</text>
    <text x="${infoX}" y="${usernameY}" class="user">@${uname}${pronouns ? ` · ${pronouns}` : ""}</text>
    ${!compact && bioLines[0] ? `<text x="${infoX}" y="${bioY}" class="bio">${bioLines[0]}</text>` : ""}
    ${!compact && bioLines[1] ? `<text x="${infoX}" y="${bioY + 12}" class="bio">${bioLines[1]}</text>` : ""}
    ${!compact && twitter ? `<g transform="translate(${infoX},${twitterY - 9})">${icon("x", c.icon, 11)}<text x="14" y="9" class="tw">@${twitter}</text></g>` : ""}
    <g transform="translate(${P},${headerY})">
      <g>
        ${icon("star", c.icon, 16)}<text x="20" y="12" class="stat">${kFormat(stats.stars)}</text>
        <text x="0" y="${statLabelY}" class="stat-label">Stars</text>
      </g>
      <g transform="translate(100,0)">
        ${icon("commit", c.icon, 16)}<text x="20" y="12" class="stat">${kFormat(stats.commits)}</text>
        <text x="0" y="${statLabelY}" class="stat-label">Commits</text>
      </g>
      <g transform="translate(220,0)">
        ${icon("issue", c.icon, 16)}<text x="20" y="12" class="stat">${kFormat(stats.issues)}</text>
        <text x="0" y="${statLabelY}" class="stat-label">Issues</text>
      </g>
      <g transform="translate(320,0)">
        ${icon("repo", c.icon, 16)}<text x="20" y="12" class="stat">${kFormat(stats.repos)}</text>
        <text x="0" y="${statLabelY}" class="stat-label">Repos</text>
      </g>
      <g transform="translate(405,0)">
        ${icon("pr", c.icon, 16)}<text x="20" y="12" class="stat">${kFormat(stats.prs)}</text>
        <text x="0" y="${statLabelY}" class="stat-label">PRs</text>
      </g>
    </g>
    <text x="${P}" y="${barY - 8}" class="sec">Top Languages</text>
    <rect x="${P}" y="${barY}" width="${barWidth}" height="8" rx="4" fill="#${c.text}" opacity=".1"/>
    <g clip-path="url(#b)">${langRects}</g>
    ${langLabels}
  </svg>`;
}
