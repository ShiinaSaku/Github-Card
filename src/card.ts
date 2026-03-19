import {
  resolveColors,
  kFormat,
  escapeXml,
  icon,
  wrapText,
  FONT_FACE,
  FONT_FAMILY,
  resolveTw,
} from "./utils/index";
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

  const bgFill = resolveTw(c.bg, "fill");
  const titleFill = resolveTw(c.title, "fill");
  const textFill = resolveTw(c.text, "fill");
  const iconFill = resolveTw(c.icon, "fill");
  const borderStroke = hideBorder ? 'stroke="none"' : resolveTw(c.border, "stroke");

  const hexFallback = (str: string) =>
    resolveTw(str, "fill").replace('fill="', "").replace('"', "");
  const rawTextFill = hexFallback(c.text);
  const rawIconFill = hexFallback(c.icon);

  const name = escapeXml(user.name || user.login);
  const uname = escapeXml(user.login);
  const bioRaw = !compact && user.bio ? escapeXml(user.bio) : "";
  const bioLines = bioRaw ? wrapText(bioRaw, 42, 2) : [];
  const pronouns = !compact && user.pronouns ? escapeXml(user.pronouns) : "";
  const avatar = (user.avatarUrl || "").replace(/&/g, "&amp;");
  const twitter = !compact && user.twitter ? escapeXml(user.twitter) : "";
  const svgTitle = escapeXml(`${name}'s GitHub Stats`);
  const bgStroke = hideBorder ? 'stroke="none"' : borderStroke;

  const W = 500;
  let H = 200;
  const P = 22;
  const avatarSize = 72;
  const barWidth = W - P * 2;

  const barY = 150;
  const labelY = 176;
  const infoX = P + avatarSize + 16;

  const totalSize = langs.reduce((sum, l) => sum + l.size, 0) || 1;
  let offset = 0;
  const GAP = 3;
  const activeLangs = langs.filter((l) => (l.size / totalSize) * barWidth > GAP); // Only show languages large enough

  const langRects = activeLangs
    .map((lang, index) => {
      const isLast = index === activeLangs.length - 1;
      let w = (lang.size / totalSize) * barWidth;
      if (!isLast) w -= GAP;
      if (w < 0) w = 0;

      const x = P + offset;
      const animation = animate
        ? `<animate attributeName="width" from="0" to="${w}" dur="${0.36 + index * 0.12}s" fill="freeze"/>`
        : "";
      const r = `<rect x="${x}" y="${barY}" width="${animate ? 0 : w}" height="10" rx="5" fill="${lang.color}">${animation}</rect>`;
      offset += w + (isLast ? 0 : GAP);
      return r;
    })
    .join("");

  let currentX = P;
  let currentY = labelY;

  const langLabels = compact
    ? ""
    : langs
        .map((lang, i) => {
          const pct = ((lang.size / totalSize) * 100).toFixed(1);
          const textStr = `${lang.name} ${pct}%`;
          const estWidth = textStr.length * 6 + 24;

          if (currentX + estWidth > W - P) {
            currentX = P;
            currentY += 18;
          }
          const lx = currentX;
          const ly = currentY;
          currentX += estWidth + 12;

          return `<circle cx="${lx + 5}" cy="${ly - 3}" r="4" fill="${lang.color}"/><text x="${lx + 14}" y="${ly + 1}" font-size="10" opacity="0.9" font-weight="500" ${textFill}>${escapeXml(textStr)}</text>`;
        })
        .join("");

  H = Math.max(200, currentY + 24);

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
        <g ${iconFill}>${icon(stat.iconName, rawIconFill, 16)}</g>
        <text x="20" y="12" font-size="14" font-weight="bold" ${textFill}>${kFormat(stat.value)}</text>
        <text x="0" y="${statLabelY}" font-size="9" font-weight="600" opacity="0.55" text-transform="uppercase" letter-spacing="0.6" ${textFill}>${stat.label}</text>
      </g>`,
    )
    .join("");

  const bio1 =
    !compact && bioLines[0]
      ? `<text x="${infoX}" y="${bioY}" font-size="11" opacity="0.65" ${textFill}>${bioLines[0]}</text>`
      : "";
  const bio2 =
    !compact && bioLines[1]
      ? `<text x="${infoX}" y="${bioY + 12}" font-size="11" opacity="0.65" ${textFill}>${bioLines[1]}</text>`
      : "";
  const twt =
    !compact && twitter
      ? `<g transform="translate(${infoX},${twitterY - 9})"><g opacity="0.7" ${textFill}>${icon("x", rawTextFill, 11)}</g><text x="14" y="9" font-size="11" opacity="0.7" ${textFill}>@${twitter}</text></g>`
      : "";

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family='${FONT_FAMILY}' preserveAspectRatio="xMinYMin meet" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc" shape-rendering="auto" text-rendering="optimizeLegibility" image-rendering="optimizeQuality">
    <title id="title">${svgTitle}</title>
    <desc id="desc">GitHub stats card for ${name}</desc>
    <defs>
      <clipPath id="a"><circle cx="${P + avatarSize / 2}" cy="${P + avatarSize / 2}" r="${avatarSize / 2}"/></clipPath>
      <filter id="shadow" x="-10%" y="-10%" width="130%" height="140%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
        <feOffset dx="0" dy="1" result="offsetblur"/>
        <feComponentTransfer><feFuncA type="linear" slope="0.15"/></feComponentTransfer>
        <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <radialGradient id="glow" cx="15%" cy="20%" r="60%">
        <stop offset="0%" stop-color="#${rawIconFill}" stop-opacity="0.18" />
        <stop offset="100%" stop-color="#${rawIconFill}" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="shine" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.08" />
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
      </linearGradient>
    </defs>
    <rect ${bgFill} width="${W}" height="${H}" rx="10"/>
    <rect fill="url(#glow)" width="${W}" height="${H}" rx="10"/>
    <rect fill="url(#shine)" width="${W}" height="${H}" rx="10"/>
    <circle cx="${P + avatarSize / 2}" cy="${P + avatarSize / 2}" r="${avatarSize / 2 + 2}" fill="none" ${borderStroke} stroke-width="1.5" opacity=".4"/>
    <image href="${avatar}" x="${P}" y="${P}" width="${avatarSize}" height="${avatarSize}" clip-path="url(#a)" preserveAspectRatio="xMidYMid slice"/>
    <rect width="${W}" height="${H}" rx="10" fill="none" ${bgStroke} stroke-width="1.5" opacity=".5"/>
    <text x="${infoX}" y="${nameY}" font-size="18" font-weight="bold" ${titleFill}>${name}</text>
    <text x="${infoX}" y="${usernameY}" font-size="12" opacity="0.7" ${textFill}>@${uname}${pronouns ? ` · ${pronouns}` : ""}</text>
    ${bio1}
    ${bio2}
    ${twt}
    <g transform="translate(${P},${headerY})">
      ${statsMarkup}
    </g>
    <text x="${P}" y="${barY - 8}" font-size="9" font-weight="600" opacity="0.5" text-transform="uppercase" letter-spacing="0.6" ${textFill}>Top Languages</text>
    <rect x="${P}" y="${barY}" width="${barWidth}" height="10" rx="5" ${textFill} opacity=".1"/>
    <g>${langRects}</g>
    ${langLabels}
  </svg>`
    .trim()
    .replace(/>\s+</g, "><");
}
