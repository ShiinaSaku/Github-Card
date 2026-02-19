import { resolveColors, kFormat, escapeXml, icon, wrapText, FONT_FACE, FONT_FAMILY } from "./utils";
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
  hide?: string[];
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
  const avatar = user.avatarUrl.replace(/&/g, "&amp;");
  const twitter = !compact && user.twitter ? escapeXml(user.twitter) : "";
  const hiddenStats = new Set((opts.hide || []).map((key) => key.toLowerCase()));
  const svgTitle = `${name}'s GitHub Stats`;

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

  const headerY = P + avatarSize + 12;
  const statLabelY = 28;

  const visibleStats = [
    { key: "stars", iconName: "star" as const, label: "Stars", value: stats.stars },
    { key: "commits", iconName: "commit" as const, label: "Commits", value: stats.commits },
    { key: "issues", iconName: "issue" as const, label: "Issues", value: stats.issues },
    { key: "repos", iconName: "repo" as const, label: "Repos", value: stats.repos },
    { key: "prs", iconName: "pr" as const, label: "PRs", value: stats.prs },
  ].filter((stat) => !hiddenStats.has(stat.key));

  const statsMarkup = visibleStats
    .map(
      (stat, index) => `<g transform="translate(${index * 100},0)">
        ${icon(stat.iconName, c.icon, 16)}
        <text x="20" y="12" class="stat">${kFormat(stat.value)}</text>
        <text x="0" y="${statLabelY}" class="stat-label">${stat.label}</text>
      </g>`,
    )
    .join("");

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMin meet" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc" shape-rendering="auto" text-rendering="optimizeLegibility" image-rendering="optimizeQuality">
    <title id="title">${svgTitle}</title>
    <desc id="desc">GitHub stats card for ${name} including stars, commits, issues, repositories, pull requests, and top languages.</desc>
    <defs>
      <clipPath id="a"><circle cx="${P + avatarSize / 2}" cy="${P + avatarSize / 2}" r="${avatarSize / 2}"/></clipPath>
      <clipPath id="b"><rect x="${P}" y="${barY}" width="${barWidth}" height="8" rx="4"/></clipPath>
      <filter id="shadow" x="-10%" y="-10%" width="130%" height="140%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
        <feOffset dx="0" dy="1" result="offsetblur"/>
        <feComponentTransfer>
          <feFuncA type="linear" slope="0.15"/>
        </feComponentTransfer>
        <feMerge>
          <feMergeNode/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    <style>
      ${FONT_FACE}
      *{font-family:${FONT_FAMILY}}
      .bg{fill:#${c.bg}}
      .title{font-size:18px;font-weight:700;fill:#${c.title}}
      .user{font-size:12px;fill:#${c.text};opacity:.7}
      ${compact ? "" : `.bio{font-size:11px;fill:#${c.text};opacity:.65}.tw{font-size:11px;fill:#${c.text};opacity:.7}.lang{font-size:10px;fill:#${c.text}}`}
      .stat{font-size:14px;font-weight:700;fill:#${c.text};text-anchor:start}
      .stat-label{font-size:9px;font-weight:600;fill:#${c.text};opacity:.55;text-transform:uppercase;letter-spacing:.6px;text-anchor:start}
      .sec{font-size:9px;font-weight:600;fill:#${c.text};opacity:.5;text-transform:uppercase;letter-spacing:.6px}
    </style>
    <rect class="bg" width="${W}" height="${H}" rx="10" stroke="${hideBorder ? "none" : `#${c.border}`}" stroke-width="1.5" filter="url(#shadow)"/>
    <circle cx="${P + avatarSize / 2}" cy="${P + avatarSize / 2}" r="${avatarSize / 2 + 2}" fill="none" stroke="#${c.border}" stroke-width="1" opacity=".6"/>
    <image href="${avatar}" x="${P}" y="${P}" width="${avatarSize}" height="${avatarSize}" clip-path="url(#a)" filter="url(#shadow)" preserveAspectRatio="xMidYMid slice"/>
    <text x="${infoX}" y="${nameY}" class="title">${name}</text>
    <text x="${infoX}" y="${usernameY}" class="user">@${uname}${pronouns ? ` · ${pronouns}` : ""}</text>
    ${!compact && bioLines[0] ? `<text x="${infoX}" y="${bioY}" class="bio">${bioLines[0]}</text>` : ""}
    ${!compact && bioLines[1] ? `<text x="${infoX}" y="${bioY + 12}" class="bio">${bioLines[1]}</text>` : ""}
    ${!compact && twitter ? `<g transform="translate(${infoX},${twitterY - 9})">${icon("x", c.icon, 11)}<text x="14" y="9" class="tw">@${twitter}</text></g>` : ""}
    <g transform="translate(${P},${headerY})">
      ${statsMarkup}
    </g>
    <text x="${P}" y="${barY - 8}" class="sec">Top Languages</text>
    <rect x="${P}" y="${barY}" width="${barWidth}" height="8" rx="4" fill="#${c.text}" opacity=".1"/>
    <g clip-path="url(#b)">${langRects}</g>
    ${langLabels}
  </svg>`;
}
