import {
  resolveColors,
  kFormat,
  escapeXml,
  icon,
  wrapText,
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
  hide_langs?: string[];
  show_langs?: string[];
  animate?: boolean;
};

const STAT_DEFS = [
  { key: "stars", iconName: "star" as const, label: "Stars" },
  { key: "commits", iconName: "commit" as const, label: "Commits" },
  { key: "issues", iconName: "issue" as const, label: "Issues" },
  { key: "repos", iconName: "repo" as const, label: "Repos" },
  { key: "prs", iconName: "pr" as const, label: "PRs" },
] as const;

/* ── helpers ───────────────────────────────────────────────── */

function raw(token: string): string {
  const m = resolveTw(token, "fill").match(/fill="([^"]+)"/);
  return m?.[1] ?? token;
}

function clamp(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "\u2026";
}

/* ── renderer ──────────────────────────────────────────────── */

export function renderCard(
  user: UserProfile,
  stats: UserStats,
  langs: LanguageStat[],
  opts: CardOpts = {},
): string {
  const hidden = new Set((opts.hide ?? []).map((k) => k.toLowerCase()));
  const c = resolveColors(opts);
  const compact = opts.compact ?? false;
  const animate = opts.animate ?? false;
  const hideBorder = opts.hide_border ?? false;
  const hideLangs = new Set((opts.hide_langs ?? []).map((k) => k.toLowerCase().trim()));
  const showLangs = new Set((opts.show_langs ?? []).map((k) => k.toLowerCase().trim()));

  const bgColor = raw(c.bg);
  const titleColor = raw(c.title);
  const textColor = raw(c.text);
  const iconColor = raw(c.icon);
  const borderColor = raw(c.border);

  /* ── font (XML-safe) ──────────────────────────────────────── */
  const fontFamily = FONT_FAMILY.replace(/"/g, "&apos;");

  /* ── profile text setup ───────────────────────────────────── */
  const displayName = user.name || user.login;
  const nameEsc = escapeXml(clamp(displayName, 28));
  const loginEsc = escapeXml(clamp(user.login, 24));
  const pronouns = !compact && user.pronouns ? escapeXml(clamp(user.pronouns, 16)) : "";
  const bioRaw = !compact && user.bio ? user.bio : "";
  const bioLines = bioRaw ? wrapText(bioRaw, 44, 2) : [];
  const twitter = !compact && user.twitter ? escapeXml(clamp(user.twitter, 22)) : "";
  const avatar = (user.avatarUrl || "").replace(/&/g, "&amp;");

  const visible = STAT_DEFS.filter((d) => !hidden.has(d.key));
  const activeLangsList = langs.filter((l) => {
    const name = l.name.toLowerCase().trim();
    if (showLangs.size > 0 && !showLangs.has(name)) return false;
    if (hideLangs.has(name)) return false;
    return true;
  });

  /* ── dimensions (dynamic width) ───────────────────────────── */
  const PX = 25; // horizontal padding
  const PY = 25; // top padding
  const avatarSize = 64;
  const avatarR = avatarSize / 2;

  // Estimate text width
  const metaLen = user.login.length + (pronouns ? pronouns.length + 3 : 0);
  const maxBioLen = bioLines.length ? Math.max(...bioLines.map((l) => l.length)) : 0;
  const profileTextW = Math.max(
    displayName.length * 11, // ~11px per bold char
    metaLen * 7.5, // ~7.5px per medium char
    maxBioLen * 6.5, // ~6.5px per small char
    twitter.length * 7 + 20,
  );

  const profileW = PX + avatarSize + 16 + profileTextW + PX;
  const statsW = visible.length > 0 ? visible.length * 85 + PX * 2 : 0;
  const langsW = activeLangsList.length > 0 ? 300 : 0; // sensible minimum for languages

  const W = Math.round(Math.min(540, Math.max(340, profileW, statsW, langsW)));
  const contentW = W - PX * 2;

  /* ── profile section ──────────────────────────────────────── */
  const infoX = PX + avatarSize + 14;
  const nameY = PY + 22;
  const loginY = nameY + 18;
  const bioStartY = loginY + 16;
  const twitterY = bioStartY + bioLines.length * 14 + (bioLines.length ? 4 : 0);

  let profileH = loginY + 10 - PY;
  if (bioLines.length) profileH = bioStartY + bioLines.length * 14 - PY;
  if (twitter) profileH = twitterY + 10 - PY;
  profileH = Math.max(profileH, avatarSize + 4);

  /* ── stats section ────────────────────────────────────────── */
  const statsY = PY + profileH + 14;
  const statW = visible.length > 0 ? contentW / visible.length : 0;
  const statsH = visible.length > 0 ? 50 : 0;

  /* ── languages section ────────────────────────────────────── */
  const totalSize = activeLangsList.reduce((s, l) => s + l.size, 0) || 1;
  const sorted = [...activeLangsList].sort((a, b) => b.size - a.size);
  const barY = statsY + statsH + (statsH ? 16 : 12);
  const barH = 8;

  const maxLegend = compact ? 0 : 6;
  const legendLangs = sorted.slice(0, maxLegend);
  const otherSize = sorted.slice(maxLegend).reduce((s, l) => s + l.size, 0);

  const legendY = barY + barH + 12;
  const legendRowH = 16;
  const legendCols = 3;
  const legendColW = contentW / legendCols;
  const legendItems: { name: string; color: string; pct: string }[] = legendLangs.map((l) => ({
    name: clamp(l.name, 14),
    color: l.color,
    pct: ((l.size / totalSize) * 100).toFixed(1),
  }));
  if (otherSize > 0 && legendItems.length > 0) {
    legendItems.push({
      name: "Other",
      color: "#6b7280",
      pct: ((otherSize / totalSize) * 100).toFixed(1),
    });
  }
  const legendRows = compact ? 0 : Math.ceil(legendItems.length / legendCols);

  const hasLangs = activeLangsList.length > 0;
  const langSectionH = hasLangs ? barH + 12 + legendRows * legendRowH + 8 : 0;

  /* ── final height ─────────────────────────────────────────── */
  const H = barY + (hasLangs ? langSectionH : 0) + 12 + (hasLangs ? 0 : 4);

  /* ── build SVG ────────────────────────────────────────────── */
  const parts: string[] = [];

  // root
  parts.push(
    '<svg width="' +
      W +
      '" height="' +
      H +
      '" viewBox="0 0 ' +
      W +
      " " +
      H +
      '" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="cardTitle cardDesc">',
  );

  // accessibility
  parts.push('<title id="cardTitle">' + escapeXml(displayName + "'s GitHub Stats") + "</title>");
  parts.push('<desc id="cardDesc">GitHub profile card for ' + escapeXml(displayName) + "</desc>");

  // ── <style> block ──────────────────────────────────────────
  const cssLines: string[] = [];
  cssLines.push("* { font-family: " + fontFamily + "; }");
  cssLines.push(".header { font-size: 18px; font-weight: 700; fill: " + titleColor + "; }");
  cssLines.push(".stat { font-size: 14px; font-weight: 600; fill: " + textColor + "; }");
  cssLines.push(".bold { font-weight: 700; }");
  cssLines.push(".icon { fill: " + iconColor + "; }");
  cssLines.push(".lang-name { font-size: 11px; fill: " + textColor + "; opacity: 0.8; }");
  cssLines.push(".lang-progress { fill: " + textColor + "; opacity: 0.08; }");
  cssLines.push(
    ".meta { font-size: 12px; font-weight: 500; fill: " + textColor + "; opacity: 0.7; }",
  );
  cssLines.push(
    ".bio { font-size: 11px; font-weight: 400; fill: " + textColor + "; opacity: 0.6; }",
  );
  cssLines.push(
    ".stat-label { font-size: 9px; font-weight: 600; fill: " +
      textColor +
      "; opacity: 0.45; letter-spacing: 0.5px; }",
  );
  cssLines.push(".stat-value { font-size: 14px; font-weight: 700; fill: " + textColor + "; }");
  cssLines.push(
    ".twitter-text { font-size: 11px; font-weight: 500; fill: " + textColor + "; opacity: 0.65; }",
  );

  if (animate) {
    cssLines.push("@keyframes fadeInAnimation { from { opacity: 0; } to { opacity: 1; } }");
    cssLines.push(".stagger { opacity: 0; animation: fadeInAnimation 0.3s ease-in-out forwards; }");
  }

  parts.push("<style>" + cssLines.join(" ") + "</style>");

  // ── <defs> ─────────────────────────────────────────────────
  parts.push("<defs>");
  parts.push(
    '<clipPath id="av"><circle cx="' +
      (PX + avatarR) +
      '" cy="' +
      (PY + avatarR) +
      '" r="' +
      avatarR +
      '"/></clipPath>',
  );
  parts.push(
    '<radialGradient id="gl" cx="12%" cy="15%" r="65%">' +
      '<stop offset="0%" stop-color="' +
      iconColor +
      '" stop-opacity="0.12"/>' +
      '<stop offset="100%" stop-color="' +
      iconColor +
      '" stop-opacity="0"/>' +
      "</radialGradient>",
  );
  parts.push("</defs>");

  // ── background rect (inset 0.5px for clean border) ─────────
  parts.push(
    '<rect x="0.5" y="0.5" width="' +
      (W - 1) +
      '" height="99%" rx="4.5" fill="' +
      bgColor +
      '" stroke-opacity="1"/>',
  );

  // glow overlay
  parts.push(
    '<rect x="0.5" y="0.5" width="' + (W - 1) + '" height="99%" rx="4.5" fill="url(#gl)"/>',
  );

  // border
  if (!hideBorder) {
    parts.push(
      '<rect x="0.5" y="0.5" width="' +
        (W - 1) +
        '" height="' +
        (H - 1) +
        '" rx="4.5" fill="none" stroke="' +
        borderColor +
        '" stroke-opacity="0.5"/>',
    );
  }

  // ── avatar ─────────────────────────────────────────────────
  parts.push(
    '<g transform="translate(0,0)">' +
      '<image href="' +
      avatar +
      '" x="' +
      PX +
      '" y="' +
      PY +
      '" width="' +
      avatarSize +
      '" height="' +
      avatarSize +
      '" clip-path="url(#av)" preserveAspectRatio="xMidYMid slice"/>' +
      '<circle cx="' +
      (PX + avatarR) +
      '" cy="' +
      (PY + avatarR) +
      '" r="' +
      (avatarR + 1.5) +
      '" fill="none" stroke="' +
      borderColor +
      '" stroke-opacity="0.3" stroke-width="1"/>' +
      "</g>",
  );

  // ── profile text ───────────────────────────────────────────
  parts.push('<g transform="translate(0,0)">');

  // name
  parts.push('<text x="' + infoX + '" y="' + nameY + '" class="header">' + nameEsc + "</text>");

  // username + pronouns
  const metaStr = pronouns ? "@" + loginEsc + " \u00b7 " + pronouns : "@" + loginEsc;
  parts.push('<text x="' + infoX + '" y="' + loginY + '" class="meta">' + metaStr + "</text>");

  // bio
  for (let i = 0; i < bioLines.length; i++) {
    parts.push(
      '<text x="' +
        infoX +
        '" y="' +
        (bioStartY + i * 14) +
        '" class="bio">' +
        escapeXml(bioLines[i]!.trim()) +
        "</text>",
    );
  }

  // twitter
  if (twitter) {
    parts.push(
      '<g transform="translate(' +
        infoX +
        "," +
        (twitterY - 9) +
        ')">' +
        icon("x", textColor, 11) +
        '<text x="15" y="9" class="twitter-text">@' +
        twitter +
        "</text></g>",
    );
  }

  parts.push("</g>");

  // ── stats row ──────────────────────────────────────────────
  if (visible.length > 0) {
    // subtle background tint anchoring the stats row
    parts.push(
      '<rect x="' +
        PX +
        '" y="' +
        (statsY - 8) +
        '" width="' +
        contentW +
        '" height="' +
        (statsH + 8) +
        '" rx="6" fill="' +
        textColor +
        '" opacity="0.04"/>',
    );

    parts.push('<g transform="translate(0,0)">');

    for (let i = 0; i < visible.length; i++) {
      const d = visible[i]!;
      const val = stats[d.key as keyof UserStats];
      const cx = PX + statW * i + statW / 2;
      const iy = statsY + 2;

      const staggerStyle = animate ? ' style="animation-delay: ' + (i + 3) * 150 + 'ms"' : "";
      const staggerClass = animate ? " stagger" : "";

      // each stat wrapped in its own <g>
      parts.push(
        '<g transform="translate(' +
          cx +
          "," +
          iy +
          ')" class="stat' +
          staggerClass +
          '"' +
          staggerStyle +
          ">",
      );

      // icon centered
      parts.push('<g transform="translate(-8,0)">' + icon(d.iconName, iconColor, 16) + "</g>");

      // value
      parts.push(
        '<text x="0" y="28" class="stat-value" text-anchor="middle">' + kFormat(val) + "</text>",
      );

      // label
      parts.push(
        '<text x="0" y="40" class="stat-label" text-anchor="middle">' +
          d.label.toUpperCase() +
          "</text>",
      );

      parts.push("</g>");
    }

    parts.push("</g>");
  }

  // ── languages ──────────────────────────────────────────────
  if (hasLangs) {
    // separator
    parts.push(
      '<line x1="' +
        PX +
        '" y1="' +
        (barY - 8) +
        '" x2="' +
        (W - PX) +
        '" y2="' +
        (barY - 8) +
        '" stroke="' +
        textColor +
        '" stroke-opacity="0.08"/>',
    );

    parts.push('<g transform="translate(0,0)">');

    // track background & clip path for rounded corners
    parts.push(
      '<clipPath id="lang-clip"><rect x="' +
        PX +
        '" y="' +
        barY +
        '" width="' +
        (animate ? "0" : contentW) +
        '" height="' +
        barH +
        '" rx="4">' +
        (animate
          ? '<animate attributeName="width" from="0" to="' +
            contentW +
            '" dur="0.6s" fill="freeze"/>'
          : "") +
        "</rect></clipPath>",
    );
    parts.push(
      '<rect x="' +
        PX +
        '" y="' +
        barY +
        '" width="' +
        contentW +
        '" height="' +
        barH +
        '" rx="4" class="lang-progress"/>',
    );

    parts.push('<g clip-path="url(#lang-clip)">');

    // segments – filter out those < 6px
    const minSeg = 6;
    const activeLangs = sorted.filter((l) => (l.size / totalSize) * contentW >= minSeg);
    let off = 0;
    for (let i = 0; i < activeLangs.length; i++) {
      const lang = activeLangs[i]!;
      const pct = ((lang.size / totalSize) * 100).toFixed(1);
      let w = (lang.size / totalSize) * contentW;
      if (w < 0) w = 0;
      const x = PX + off;

      const tooltip = compact ? "" : "<title>" + escapeXml(lang.name) + " " + pct + "%</title>";

      parts.push(
        '<rect x="' +
          x +
          '" y="' +
          barY +
          '" width="' +
          w +
          '" height="' +
          barH +
          '" fill="' +
          lang.color +
          '">' +
          tooltip +
          "</rect>",
      );
      off += w;
    }

    parts.push("</g>");

    // legend (3-column grid)
    for (let i = 0; i < legendItems.length; i++) {
      const item = legendItems[i]!;
      const col = i % legendCols;
      const row = Math.floor(i / legendCols);
      const lx = PX + col * legendColW;
      const ly = legendY + row * legendRowH;

      const staggerStyle = animate ? ' style="animation-delay: ' + (i + 3) * 150 + 'ms"' : "";
      const staggerClass = animate ? ' class="stagger"' : "";

      parts.push("<g" + staggerClass + staggerStyle + ">");
      parts.push('<circle cx="' + (lx + 5) + '" cy="' + ly + '" r="4" fill="' + item.color + '"/>');
      parts.push(
        '<text x="' +
          (lx + 14) +
          '" y="' +
          (ly + 4) +
          '" class="lang-name" font-weight="500">' +
          escapeXml(item.name) +
          " " +
          item.pct +
          "%</text>",
      );
      parts.push("</g>");
    }

    parts.push("</g>");
  }

  // close
  parts.push("</svg>");

  return parts.join("");
}
