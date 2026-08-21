import {
  resolveColors,
  kFormat,
  escapeXml,
  icon,
  wrapText,
  measureText,
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

type LangVisual = {
  name: string;
  color: string;
  size: number;
};

/* ── tiny SVG builder ──────────────────────────────────────── */

function el(
  tag: string,
  attrs: Record<string, string | number | undefined>,
  children = "",
): string {
  let a = "";
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === "") continue;
    a += ` ${k}="${escapeXml(String(v))}"`;
  }
  if (!children) return `<${tag}${a} />`;
  return `<${tag}${a}>${children}</${tag}>`;
}

/* ── helpers ───────────────────────────────────────────────── */

function raw(token: string): string {
  const m = resolveTw(token, "fill").match(/fill="([^"]+)"/);
  return m?.[1] ?? token;
}

function clamp(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "\u2026";
}

function buildLanguageSegments(
  langs: LanguageStat[],
  totalSize: number,
  contentW: number,
): LangVisual[] {
  const minSegmentW = 6;
  const visible: LangVisual[] = [];
  let tinySize = 0;

  for (const lang of langs) {
    const segmentW = (lang.size / totalSize) * contentW;
    if (segmentW < minSegmentW) {
      tinySize += lang.size;
      continue;
    }
    visible.push(lang);
  }

  if (tinySize > 0) {
    visible.push({ name: "Other", color: "#6b7280", size: tinySize });
  }

  return visible.length > 0 ? visible : langs;
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

  const fontFamily = FONT_FAMILY;

  /* ── profile text ─────────────────────────────────────────── */
  const displayName = user.name || user.login;
  const nameEsc = escapeXml(clamp(displayName, 28));
  const loginEsc = escapeXml(clamp(user.login, 24));
  const pronouns = !compact && user.pronouns ? escapeXml(clamp(user.pronouns, 16)) : "";
  const bioRaw = !compact && user.bio ? user.bio : "";
  const bioLines = bioRaw ? wrapText(bioRaw, 44, 2) : [];
  const twitter = !compact && user.twitter ? escapeXml(clamp(user.twitter, 22)) : "";
  const avatar = user.avatarUrl || "";
  const metaStr = pronouns ? `@${loginEsc} \u00b7 ${pronouns}` : `@${loginEsc}`;

  const visible = STAT_DEFS.filter((d) => !hidden.has(d.key));
  const activeLangsList = langs.filter((l) => {
    const name = l.name.toLowerCase().trim();
    if (showLangs.size > 0 && !showLangs.has(name)) return false;
    if (hideLangs.has(name)) return false;
    return true;
  });

  /* ── dimensions (measured, dynamic width) ───────────────── */
  const PX = 24; // horizontal padding
  const PY = 22; // top padding
  const avatarSize = 60;
  const avatarR = avatarSize / 2;
  const textGap = 16;

  const nameW = measureText(displayName, 17, 700);
  const metaW = measureText(metaStr, 12.5, 500);
  const bioW = bioLines.length ? Math.max(...bioLines.map((l) => measureText(l, 11.5, 400))) : 0;
  const twitterW = twitter ? measureText(`@${twitter}`, 11.5, 500) : 0;
  const profileTextW = Math.max(nameW, metaW, bioW, twitterW);

  const profileW = PX + avatarSize + textGap + profileTextW + PX;
  const statsW = visible.length > 0 ? visible.length * 84 + PX * 2 : 0;
  const langsW = activeLangsList.length > 0 ? 300 : 0;

  const W = Math.round(Math.min(540, Math.max(340, profileW, statsW, langsW)));
  const contentW = W - PX * 2;

  /* ── profile section ─────────────────────────────────────── */
  const infoX = PX + avatarSize + textGap;
  const nameY = PY + 20;
  const loginY = nameY + 17;
  const bioStartY = loginY + 15;
  const twitterY = bioStartY + bioLines.length * 14 + (bioLines.length ? 4 : 0);

  let profileH = loginY + 8 - PY;
  if (bioLines.length) profileH = bioStartY + bioLines.length * 14 - PY;
  if (twitter) profileH = twitterY + 10 - PY;
  profileH = Math.max(profileH, avatarSize + 6);

  /* ── stats section ────────────────────────────────────────── */
  const statsY = PY + profileH + 16;
  const statW = visible.length > 0 ? contentW / visible.length : 0;
  const statsH = visible.length > 0 ? 58 : 0;

  /* ── languages section ─────────────────────────────────── */
  const totalSize = activeLangsList.reduce((s, l) => s + l.size, 0) || 1;
  const sorted = [...activeLangsList].sort((a, b) => b.size - a.size);
  const visualLangs = buildLanguageSegments(sorted, totalSize, contentW);
  const barY = statsY + statsH + (statsH ? 18 : 14);
  const barH = 10;

  const maxLegend = compact ? 0 : 6;
  const legendLangs = visualLangs.slice(0, maxLegend);
  const otherSize = visualLangs.slice(maxLegend).reduce((s, l) => s + l.size, 0);

  const legendY = barY + barH + 14;
  const legendRowH = 17;
  const legendCols = 3;
  const legendColW = contentW / legendCols;
  const legendItems: { name: string; color: string; pct: string }[] = legendLangs.map((l) => ({
    name: clamp(l.name, 14),
    color: l.color,
    pct: ((l.size / totalSize) * 100).toFixed(1),
  }));
  if (otherSize > 0 && legendItems.length > 0) {
    const existingOther = legendItems.find((item) => item.name === "Other");
    if (existingOther) {
      existingOther.pct = (
        (((Number(existingOther.pct) / 100) * totalSize + otherSize) / totalSize) *
        100
      ).toFixed(1);
    } else {
      legendItems.push({
        name: "Other",
        color: "#6b7280",
        pct: ((otherSize / totalSize) * 100).toFixed(1),
      });
    }
  }
  const legendRows = compact ? 0 : Math.ceil(legendItems.length / legendCols);

  const hasLangs = activeLangsList.length > 0;
  const langSectionH = hasLangs ? barH + 14 + legendRows * legendRowH + 10 : 0;

  /* ── final height ────────────────────────────────────────── */
  const H = barY + (hasLangs ? langSectionH : 0) + 14 + (hasLangs ? 0 : 6);

  /* ── accessibility ────────────────────────────────────────── */
  const parts: string[] = [];
  const svgAttrs: Record<string, string | number> = {
    width: W,
    height: H,
    viewBox: `0 0 ${W} ${H}`,
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    role: "img",
    "aria-labelledby": "cardTitle cardDesc",
  };
  let svgOpen = "<svg";
  for (const [k, v] of Object.entries(svgAttrs)) svgOpen += ` ${k}="${escapeXml(String(v))}"`;
  parts.push(svgOpen + ">");
  parts.push(el("title", { id: "cardTitle" }, `${escapeXml(displayName)}'s GitHub Stats`));
  parts.push(
    el(
      "desc",
      { id: "cardDesc" },
      `GitHub profile card for ${escapeXml(displayName)} with ${kFormat(stats.stars)} stars, ${kFormat(stats.commits)} commits, and ${activeLangsList.length} highlighted languages.`,
    ),
  );

  /* ── styles ──────────────────────────────────────────────── */
  const css: string[] = [];
  css.push(
    `* { font-family: ${fontFamily}; text-rendering: geometricPrecision; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }`,
  );
  css.push(
    `.header { font-size: 17px; font-weight: 700; fill: ${titleColor}; letter-spacing: -0.015em; }`,
  );
  css.push(`.stat { font-size: 14px; font-weight: 600; fill: ${textColor}; }`);
  css.push(`.icon { fill: ${iconColor}; }`);
  css.push(`.lang-name { font-size: 11px; fill: ${textColor}; opacity: 0.82; }`);
  css.push(`.lang-progress { fill: ${textColor}; opacity: 0.07; }`);
  css.push(`.meta { font-size: 12.5px; font-weight: 500; fill: ${textColor}; opacity: 0.72; }`);
  css.push(`.bio { font-size: 11.5px; font-weight: 400; fill: ${textColor}; opacity: 0.68; }`);
  css.push(
    `.stat-label { font-size: 10px; font-weight: 700; fill: ${textColor}; opacity: 0.68; letter-spacing: 0.06em; }`,
  );
  css.push(
    `.stat-value { font-size: 16px; font-weight: 700; fill: ${textColor}; letter-spacing: -0.015em; font-variant-numeric: tabular-nums; font-feature-settings: "tnum"; }`,
  );
  css.push(
    `.twitter-text { font-size: 11.5px; font-weight: 500; fill: ${textColor}; opacity: 0.65; }`,
  );

  if (animate) {
    css.push("@keyframes fadeInAnimation { from { opacity: 0; } to { opacity: 1; } }");
    css.push(".stagger { opacity: 0; animation: fadeInAnimation 0.3s ease-in-out forwards; }");
  }

  parts.push(el("style", {}, css.join(" ")));

  /* ── defs ────────────────────────────────────────────────── */
  parts.push(
    el(
      "defs",
      {},
      [
        el(
          "clipPath",
          { id: "av" },
          el("circle", { cx: PX + avatarR, cy: PY + avatarR, r: avatarR }),
        ),
        el(
          "radialGradient",
          { id: "gl", cx: "12%", cy: "15%", r: "65%" },
          el("stop", { offset: "0%", "stop-color": iconColor, "stop-opacity": "0.08" }) +
            el("stop", { offset: "100%", "stop-color": iconColor, "stop-opacity": "0" }),
        ),
        el(
          "radialGradient",
          { id: "gl2", cx: "92%", cy: "95%", r: "55%" },
          el("stop", { offset: "0%", "stop-color": titleColor, "stop-opacity": "0.035" }) +
            el("stop", { offset: "100%", "stop-color": titleColor, "stop-opacity": "0" }),
        ),
        el(
          "linearGradient",
          { id: "ring", x1: "0", y1: "0", x2: "1", y2: "1" },
          el("stop", { offset: "0%", "stop-color": titleColor }) +
            el("stop", { offset: "100%", "stop-color": iconColor }),
        ),
        el(
          "linearGradient",
          { id: "card-bg", x1: "0", y1: "0", x2: W, y2: H, gradientUnits: "userSpaceOnUse" },
          el("stop", { offset: "0%", "stop-color": bgColor }) +
            el("stop", { offset: "82%", "stop-color": bgColor }) +
            el("stop", { offset: "100%", "stop-color": titleColor, "stop-opacity": "0.04" }),
        ),
        el(
          "linearGradient",
          { id: "rim", x1: "0", y1: "0", x2: W, y2: "0", gradientUnits: "userSpaceOnUse" },
          el("stop", { offset: "0%", "stop-color": iconColor, "stop-opacity": "0" }) +
            el("stop", { offset: "45%", "stop-color": iconColor, "stop-opacity": "0.28" }) +
            el("stop", { offset: "100%", "stop-color": iconColor, "stop-opacity": "0" }),
        ),
      ].join(""),
    ),
  );

  /* ── background & glow ───────────────────────────────────── */
  parts.push(
    el("rect", { x: "0.5", y: "0.5", width: W - 1, height: H - 1, rx: 12, fill: "url(#card-bg)" }),
  );
  parts.push(
    el("rect", { x: "0.5", y: "0.5", width: W - 1, height: H - 1, rx: 12, fill: "url(#gl)" }),
  );
  parts.push(
    el("rect", { x: "0.5", y: "0.5", width: W - 1, height: H - 1, rx: 12, fill: "url(#gl2)" }),
  );
  parts.push(
    el("line", {
      x1: PX,
      y1: "1.5",
      x2: W - PX,
      y2: "1.5",
      stroke: "url(#rim)",
      "stroke-width": 1,
    }),
  );

  if (!hideBorder) {
    parts.push(
      el("rect", {
        x: "0.5",
        y: "0.5",
        width: W - 1,
        height: H - 1,
        rx: 12,
        fill: "none",
        stroke: borderColor,
        "stroke-opacity": "0.5",
      }),
    );
  }

  /* ── avatar ───────────────────────────────────────────────── */
  parts.push(
    el(
      "g",
      {},
      el("circle", {
        cx: PX + avatarR + 1,
        cy: PY + avatarR + 1,
        r: avatarR + 3,
        fill: titleColor,
        opacity: "0.08",
      }) +
        el("image", {
          href: avatar,
          x: PX,
          y: PY,
          width: avatarSize,
          height: avatarSize,
          "clip-path": "url(#av)",
          preserveAspectRatio: "xMidYMid slice",
        }) +
        el("circle", {
          cx: PX + avatarR,
          cy: PY + avatarR,
          r: avatarR + 1.5,
          fill: "none",
          stroke: "url(#ring)",
          "stroke-opacity": "0.55",
          "stroke-width": "1.5",
        }),
    ),
  );

  /* ── profile text ─────────────────────────────────────────── */
  const textParts: string[] = [];
  textParts.push(el("text", { x: infoX, y: nameY, class: "header" }, nameEsc));
  textParts.push(el("text", { x: infoX, y: loginY, class: "meta" }, metaStr));
  for (let i = 0; i < bioLines.length; i++) {
    textParts.push(
      el("text", { x: infoX, y: bioStartY + i * 14, class: "bio" }, escapeXml(bioLines[i]!.trim())),
    );
  }
  if (twitter) {
    textParts.push(
      el(
        "g",
        { transform: `translate(${infoX},${twitterY - 9})` },
        icon("x", textColor, 11) +
          el("text", { x: 15, y: 9, class: "twitter-text" }, `@${twitter}`),
      ),
    );
  }
  parts.push(el("g", {}, textParts.join("")));

  /* ── stats row ───────────────────────────────────────────── */
  if (visible.length > 0) {
    const statParts: string[] = [];

    for (let i = 0; i < visible.length; i++) {
      const d = visible[i]!;
      const val = stats[d.key as keyof UserStats];
      const cx = PX + statW * i + statW / 2;
      const iy = statsY + 4;

      const staggerClass = animate ? " stagger" : "";

      // Vertical stack: icon → value → label, all centered, with airy gaps.
      const iconSize = 15;
      const iconY = 2;
      const valueY = 37;
      const labelY = 52;

      const cellParts: string[] = [];
      cellParts.push(
        el(
          "g",
          { transform: `translate(${-iconSize / 2},${iconY})`, class: "stat-icon" },
          icon(d.iconName, iconColor, iconSize),
        ),
      );
      cellParts.push(
        el("text", { x: 0, y: valueY, class: "stat-value", "text-anchor": "middle" }, kFormat(val)),
      );
      cellParts.push(
        el(
          "text",
          { x: 0, y: labelY, class: "stat-label", "text-anchor": "middle" },
          d.label.toUpperCase(),
        ),
      );

      statParts.push(
        el(
          "g",
          {
            transform: `translate(${cx},${iy})`,
            class: `stat${staggerClass}`,
            style: animate ? `animation-delay: ${(i + 3) * 150}ms` : undefined,
          },
          cellParts.join(""),
        ),
      );

      // Subtle divider between stats (not after the last one).
      if (i < visible.length - 1) {
        const dx = PX + statW * (i + 1);
        statParts.push(
          el("line", {
            x1: dx,
            y1: statsY + 4,
            x2: dx,
            y2: statsY + statsH - 6,
            stroke: textColor,
            "stroke-opacity": "0.12",
          }),
        );
      }
    }
    parts.push(el("g", {}, statParts.join("")));
  }

  /* ── languages ───────────────────────────────────────────── */
  if (hasLangs) {
    const langParts: string[] = [];
    langParts.push(
      el("line", {
        x1: PX,
        y1: barY - 8,
        x2: W - PX,
        y2: barY - 8,
        stroke: textColor,
        "stroke-opacity": "0.08",
      }),
    );

    langParts.push(
      el(
        "clipPath",
        { id: "lang-clip" },
        el(
          "rect",
          {
            x: PX,
            y: barY,
            width: animate ? "0" : contentW,
            height: barH,
            rx: 5,
          },
          animate
            ? el("animate", {
                attributeName: "width",
                from: "0",
                to: contentW,
                dur: "0.6s",
                fill: "freeze",
              })
            : "",
        ),
      ),
    );
    langParts.push(
      el("rect", { x: PX, y: barY, width: contentW, height: barH, rx: 5, class: "lang-progress" }),
    );

    const barParts: string[] = [];
    let off = 0;
    for (let i = 0; i < visualLangs.length; i++) {
      const lang = visualLangs[i]!;
      const pct = ((lang.size / totalSize) * 100).toFixed(1);
      let w = i === visualLangs.length - 1 ? contentW - off : (lang.size / totalSize) * contentW;
      if (w < 0) w = 0;
      const x = PX + off;
      const tooltip = compact ? "" : el("title", {}, `${escapeXml(lang.name)} ${pct}%`);
      barParts.push(el("rect", { x, y: barY, width: w, height: barH, fill: lang.color }, tooltip));
      off += w;
    }
    langParts.push(el("g", { "clip-path": "url(#lang-clip)" }, barParts.join("")));

    for (let i = 0; i < legendItems.length; i++) {
      const item = legendItems[i]!;
      const col = i % legendCols;
      const row = Math.floor(i / legendCols);
      const lx = PX + col * legendColW;
      const ly = legendY + row * legendRowH;

      langParts.push(
        el(
          "g",
          {
            class: animate ? "stagger" : undefined,
            style: animate ? `animation-delay: ${(i + 3) * 150}ms` : undefined,
          },
          el("circle", { cx: lx + 5, cy: ly, r: 4, fill: item.color }) +
            el(
              "text",
              { x: lx + 14, y: ly + 4, class: "lang-name", "font-weight": "500" },
              `${escapeXml(item.name)} ${item.pct}%`,
            ),
        ),
      );
    }

    parts.push(el("g", {}, langParts.join("")));
  }

  parts.push("</svg>");
  return parts.join("");
}
