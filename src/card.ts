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
  animate?: boolean;
  variant?: "classic" | "hyper";
};

function getVisibleStats(stats: UserStats, hiddenStats: Set<string>) {
  return [
    { key: "stars", iconName: "star" as const, label: "Stars", value: stats.stars },
    { key: "commits", iconName: "commit" as const, label: "Commits", value: stats.commits },
    { key: "issues", iconName: "issue" as const, label: "Issues", value: stats.issues },
    { key: "repos", iconName: "repo" as const, label: "Repos", value: stats.repos },
    { key: "prs", iconName: "pr" as const, label: "PRs", value: stats.prs },
  ].filter((stat) => !hiddenStats.has(stat.key));
}

export function renderCard(
  user: UserProfile,
  stats: UserStats,
  langs: LanguageStat[],
  opts: CardOpts = {},
): string {
  const hiddenStats = new Set((opts.hide || []).map((key) => key.toLowerCase()));
  if ((opts.variant ?? "classic") === "hyper") {
    return renderHyperCard(user, stats, langs, opts, hiddenStats);
  }
  return renderClassicCard(user, stats, langs, opts, hiddenStats);
}

function renderClassicCard(
  user: UserProfile,
  stats: UserStats,
  langs: LanguageStat[],
  opts: CardOpts,
  hiddenStats: Set<string>,
): string {
  const c = resolveColors(opts);
  const hideBorder = opts.hide_border ?? false;
  const compact = opts.compact ?? false;
  const animate = opts.animate ?? false;

  const name = escapeXml(user.name || user.login);
  const uname = escapeXml(user.login);
  const bioRaw = !compact && user.bio ? escapeXml(user.bio) : "";
  const bioLines = bioRaw ? wrapText(bioRaw, 42, 2) : [];
  const pronouns = !compact && user.pronouns ? escapeXml(user.pronouns) : "";
  const avatar = user.avatarUrl.replace(/&/g, "&amp;");
  const twitter = !compact && user.twitter ? escapeXml(user.twitter) : "";
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
    .map((lang, index) => {
      const w = (lang.size / totalSize) * barWidth;
      const x = P + offset;
      const animation = animate
        ? `<animate attributeName="width" from="0" to="${w}" dur="${0.36 + index * 0.12}s" fill="freeze"/>`
        : "";
      const r = `<rect x="${x}" y="${barY}" width="${animate ? 0 : w}" height="8" fill="${lang.color}">${animation}</rect>`;
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

  const visibleStats = getVisibleStats(stats, hiddenStats);
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

function renderHyperCard(
  user: UserProfile,
  stats: UserStats,
  langs: LanguageStat[],
  opts: CardOpts,
  hiddenStats: Set<string>,
): string {
  const c = resolveColors(opts);
  const compact = opts.compact ?? false;
  const animate = opts.animate ?? true;

  const W = 500;
  const H = 200;
  const P = 16;
  const avatarSize = 62;
  const name = escapeXml(user.name || user.login);
  const uname = escapeXml(user.login);
  const pronouns = !compact && user.pronouns ? escapeXml(user.pronouns) : "";
  const bioRaw = !compact && user.bio ? escapeXml(user.bio) : "";
  const bioLines = bioRaw ? wrapText(bioRaw, 38, 2) : [];
  const avatar = user.avatarUrl.replace(/&/g, "&amp;");

  const visibleStats = getVisibleStats(stats, hiddenStats);
  const statSlot = Math.max(86, Math.floor((W - P * 2) / Math.max(visibleStats.length, 1)));

  const topLangs = langs.slice(0, 5);
  const totalLangSize = topLangs.reduce((sum, lang) => sum + lang.size, 0) || 1;

  let offset = 0;
  const stackedLanguages = topLangs
    .map((lang, index) => {
      const w = (lang.size / totalLangSize) * (W - P * 2);
      const x = P + offset;
      offset += w;
      const delay = (index * 0.12).toFixed(2);
      return `<rect x="${x}" y="164" width="${animate ? 0 : w}" height="10" rx="5" fill="${lang.color}" class="lang-bar" style="animation-delay:${delay}s">${
        animate
          ? `<animate attributeName="width" from="0" to="${w}" dur="0.8s" fill="freeze" begin="${delay}s"/>`
          : ""
      }</rect>`;
    })
    .join("");

  const languageBadges = topLangs
    .map((lang, index) => {
      const pct = ((lang.size / totalLangSize) * 100).toFixed(0);
      const x = P + index * 96;
      return `<g transform="translate(${x},181)">
        <circle cx="4" cy="0" r="3" fill="${lang.color}"/>
        <text x="11" y="3" class="lang-chip">${escapeXml(lang.name)} ${pct}%</text>
      </g>`;
    })
    .join("");

  const statsMarkup = visibleStats
    .map((stat, index) => {
      const x = P + index * statSlot;
      return `<g transform="translate(${x},94)">
        <rect class="stat-chip" width="${statSlot - 8}" height="50" rx="10"/>
        <g transform="translate(10,8)">${icon(stat.iconName, c.icon, 13)}</g>
        <text x="30" y="20" class="stat-value">${kFormat(stat.value)}</text>
        <text x="10" y="36" class="stat-label-hyper">${stat.label}</text>
      </g>`;
    })
    .join("");

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Hyper GitHub card for ${name}">
    <defs>
      <linearGradient id="hyper-bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#${c.bg}"/>
        <stop offset="65%" stop-color="#${c.border}"/>
        <stop offset="100%" stop-color="#0d1d3a"/>
      </linearGradient>
      <radialGradient id="hyper-orb-a" cx="20%" cy="18%" r="70%">
        <stop offset="0%" stop-color="#${c.icon}" stop-opacity="0.42"/>
        <stop offset="100%" stop-color="#${c.icon}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="hyper-orb-b" cx="84%" cy="88%" r="60%">
        <stop offset="0%" stop-color="#${c.title}" stop-opacity="0.33"/>
        <stop offset="100%" stop-color="#${c.title}" stop-opacity="0"/>
      </radialGradient>
      <pattern id="hyper-grid" width="20" height="20" patternUnits="userSpaceOnUse">
        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#${c.text}" stroke-opacity="0.08" stroke-width="1"/>
      </pattern>
      <clipPath id="hyper-avatar"><circle cx="${P + avatarSize / 2}" cy="${P + avatarSize / 2}" r="${avatarSize / 2}"/></clipPath>
      <filter id="hyper-glow" x="-35%" y="-35%" width="170%" height="170%">
        <feGaussianBlur stdDeviation="6" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    <style>
      ${FONT_FACE}
      *{font-family:${FONT_FAMILY}}
      .title{font-size:20px;font-weight:800;fill:#${c.title};letter-spacing:.2px}
      .user{font-size:11px;fill:#${c.text};opacity:.88}
      .bio{font-size:10px;fill:#${c.text};opacity:.72}
      .stat-chip{fill:rgba(255,255,255,0.05);stroke:rgba(255,255,255,0.16);stroke-width:1}
      .stat-value{font-size:14px;font-weight:700;fill:#${c.text}}
      .stat-label-hyper{font-size:9px;font-weight:600;fill:#${c.text};opacity:.62;text-transform:uppercase;letter-spacing:.75px}
      .lang-chip{font-size:9px;fill:#${c.text};opacity:.78}
      ${
        animate
          ? `
      .pulse{animation:pulse 2.4s ease-in-out infinite}
      .float{animation:float 5s ease-in-out infinite}
      @keyframes pulse{0%,100%{opacity:.45}50%{opacity:.85}}
      @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.8px)}}`
          : ""
      }
    </style>
    <rect width="${W}" height="${H}" rx="12" fill="url(#hyper-bg)"/>
    <rect width="${W}" height="${H}" rx="12" fill="url(#hyper-grid)" opacity="0.7"/>
    <rect width="${W}" height="${H}" rx="12" fill="url(#hyper-orb-a)" class="pulse"/>
    <rect width="${W}" height="${H}" rx="12" fill="url(#hyper-orb-b)" class="pulse"/>

    <g class="float">
      <circle cx="${P + avatarSize / 2}" cy="${P + avatarSize / 2}" r="${avatarSize / 2 + 4}" fill="none" stroke="#${c.icon}" stroke-opacity="0.5" stroke-width="1.2"/>
      <image href="${avatar}" x="${P}" y="${P}" width="${avatarSize}" height="${avatarSize}" clip-path="url(#hyper-avatar)" preserveAspectRatio="xMidYMid slice"/>
    </g>

    <text x="${P + avatarSize + 14}" y="34" class="title">${name}</text>
    <text x="${P + avatarSize + 14}" y="51" class="user">@${uname}${pronouns ? ` · ${pronouns}` : ""}</text>
    ${bioLines[0] ? `<text x="${P + avatarSize + 14}" y="67" class="bio">${bioLines[0]}</text>` : ""}
    ${bioLines[1] ? `<text x="${P + avatarSize + 14}" y="79" class="bio">${bioLines[1]}</text>` : ""}

    ${statsMarkup}

    <g filter="url(#hyper-glow)">${stackedLanguages}</g>
    ${languageBadges}
  </svg>`;
}
