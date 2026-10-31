import { parse, formatHex, formatHex8 } from "culori";
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
import type { UserProfile, UserStats, LanguageStat, CardOptions } from "./types";

export type CardOpts = CardOptions;

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
  const value = resolveTw(token, "fill").match(/fill="([^"]+)"/)?.[1] ?? token;
  const color = parse(value);
  return color
    ? color.alpha === undefined || color.alpha === 1
      ? formatHex(color)
      : formatHex8(color)
    : "#6b7280";
}

function fitText(text: string, width: number, size: number, weight = 400): string {
  if (measureText(text, size, weight) <= width) return text;
  const chars = Array.from(text);
  while (chars.length && measureText(chars.join("") + "…", size, weight) > width) chars.pop();
  return chars.join("").trimEnd() + "…";
}

// Stable output keeps ETags useful; the gallery supplies a distinct prefix per theme.
function cardId(value: string): string {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619);
  return `card-${(hash >>> 0).toString(36)}`;
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

  return visible;
}

/* ── renderer ──────────────────────────────────────────────── */

export function renderCard(
  user: UserProfile,
  stats: UserStats,
  langs: LanguageStat[],
  opts: CardOpts = {},
): string {
  const namespace = cardId(JSON.stringify([user, stats, langs, opts]));
  const selector = `#${namespace}-root`;
  const hidden = new Set((opts.hide ?? []).map((k) => k.trim().toLowerCase()));
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

  /* ── profile text ─────────────────────────────────────────── */
  const displayName = user.name?.trim() || user.login;
  const pronouns = !compact && user.pronouns ? user.pronouns : "";
  const bioRaw = !compact && user.bio ? user.bio : "";
  const twitterRaw = !compact && user.twitter ? user.twitter.replace(/^@/, "") : "";
  const avatar = user.avatarUrl || "";
  const metaRaw = `@${user.login}${pronouns ? ` · ${pronouns}` : ""}`;

  const visible = STAT_DEFS.filter((d) => !hidden.has(d.key));
  const activeLangsList = langs.filter((l) => {
    if (!Number.isFinite(l.size) || l.size <= 0) return false;
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
  const metaW = measureText(metaRaw, 12.5, 500);
  const profileW = PX + avatarSize + textGap + Math.max(nameW, metaW) + PX;
  const statsW = visible.length > 0 ? visible.length * 84 + PX * 2 : 0;
  const W = Math.round(Math.min(540, Math.max(340, profileW, statsW)));
  const contentW = W - PX * 2;
  const profileTextW = contentW - avatarSize - textGap;
  const nameEsc = escapeXml(fitText(displayName, profileTextW, 17, 700));
  const metaStr = escapeXml(fitText(metaRaw, profileTextW, 12.5, 500));
  const bioLines = wrapText(bioRaw, 44, 2).map((line) => fitText(line, profileTextW, 11.5));
  const twitter = escapeXml(
    fitText(twitterRaw ? `@${twitterRaw}` : "", profileTextW - 15, 11.5, 500),
  );

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
  let visualLangs = buildLanguageSegments(sorted, totalSize, contentW);
  // The legend and bar must describe the same groups and colors.
  if (!compact && visualLangs.length > 6) {
    const named = visualLangs.filter((lang) => lang.name !== "Other").slice(0, 5);
    const otherSize = totalSize - named.reduce((sum, lang) => sum + lang.size, 0);
    visualLangs = [...named, { name: "Other", color: "#6b7280", size: otherSize }];
  }
  const barY = statsY + statsH + (statsH ? 18 : 14);
  const barH = 10;
  const legendY = barY + barH + 14;
  const legendRowH = 17;
  const legendCols = Math.min(3, Math.max(1, Math.floor(contentW / 150)));
  const legendColW = contentW / legendCols;
  const legendItems = compact
    ? []
    : visualLangs.map((lang) => {
        const pct = ((lang.size / totalSize) * 100).toFixed(1);
        const suffixW = measureText(` ${pct}%`, 11, 500);
        return {
          name: fitText(lang.name, legendColW - 20 - suffixW, 11, 500),
          color: raw(lang.color),
          pct,
        };
      });
  const legendRows = compact ? 0 : Math.ceil(legendItems.length / legendCols);

  const hasLangs = activeLangsList.length > 0;
  const langSectionH = hasLangs ? barH + 14 + legendRows * legendRowH + 10 : 0;

  /* ── final height ────────────────────────────────────────── */
  const H = barY + (hasLangs ? langSectionH : 0) + 14 + (hasLangs ? 0 : 6);

  /* ── accessibility ────────────────────────────────────────── */
  const parts: string[] = [];
  const svgAttrs: Record<string, string | number> = {
    id: "root",
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
      escapeXml(
        `GitHub profile card for ${displayName}. ${visible
          .map(({ key, label }) => {
            const value = stats[key];
            return value === null ? `${label}: unavailable` : `${label}: ${kFormat(value)}`;
          })
          .join(", ")}. ${activeLangsList.length} highlighted languages.`,
      ),
    ),
  );

  /* ── styles ──────────────────────────────────────────────── */
  const css: string[] = [];
  css.push(
    `${selector} { font-family: ${FONT_FAMILY}; text-rendering: geometricPrecision; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }`,
  );
  css.push(
    `${selector} .header { font-size: 17px; font-weight: 700; fill: ${titleColor}; letter-spacing: -0.015em; }`,
  );
  css.push(`${selector} .lang-name { font-size: 11px; fill: ${textColor}; opacity: 0.82; }`);
  css.push(`${selector} .lang-progress { fill: ${textColor}; opacity: 0.07; }`);
  css.push(
    `${selector} .meta { font-size: 12.5px; font-weight: 500; fill: ${textColor}; opacity: 0.72; }`,
  );
  css.push(
    `${selector} .bio { font-size: 11.5px; font-weight: 400; fill: ${textColor}; opacity: 0.68; }`,
  );
  css.push(
    `${selector} .stat-label { font-size: 10px; font-weight: 700; fill: ${textColor}; opacity: 0.68; letter-spacing: 0.06em; }`,
  );
  css.push(
    `${selector} .stat-value { font-size: 16px; font-weight: 700; fill: ${textColor}; letter-spacing: -0.015em; font-variant-numeric: tabular-nums; font-feature-settings: "tnum"; }`,
  );
  css.push(
    `${selector} .twitter-text { font-size: 11.5px; font-weight: 500; fill: ${textColor}; opacity: 0.65; }`,
  );

  if (animate) {
    css.push(`@keyframes ${namespace}-fade { from { opacity: 0; } to { opacity: 1; } }`);
    css.push(
      `${selector} .stagger { opacity: 0; animation: ${namespace}-fade 0.3s ease-in-out forwards; }`,
    );
  }

  parts.push(el("style", {}, escapeXml(css.join(" "))));

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
        icon("x", textColor, 11) + el("text", { x: 15, y: 9, class: "twitter-text" }, twitter),
      ),
    );
  }
  parts.push(el("g", {}, textParts.join("")));

  /* ── stats row ───────────────────────────────────────────── */
  if (visible.length > 0) {
    const statParts: string[] = [];

    for (let i = 0; i < visible.length; i++) {
      const d = visible[i]!;
      const val = stats[d.key];
      const cx = PX + statW * i + statW / 2;
      const iy = statsY + 4;

      // Vertical stack: icon → value → label, all centered, with airy gaps.
      const iconSize = 15;
      const iconY = 2;
      const valueY = 37;
      const labelY = 52;

      const cellParts: string[] = [
        el(
          "title",
          {},
          val === null ? `${d.label}: unavailable` : `${d.label}: ${val.toLocaleString("en-US")}`,
        ),
      ];
      cellParts.push(
        el(
          "g",
          { transform: `translate(${-iconSize / 2},${iconY})` },
          icon(d.iconName, iconColor, iconSize),
        ),
      );
      cellParts.push(
        el(
          "text",
          { x: 0, y: valueY, class: "stat-value", "text-anchor": "middle" },
          val === null ? "—" : kFormat(val),
        ),
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
            class: animate ? "stagger" : undefined,
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
      barParts.push(
        el("rect", { x, y: barY, width: w, height: barH, fill: raw(lang.color) }, tooltip),
      );
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
  return parts
    .join("")
    .replace(/\bid="([^"]+)"/g, (_, id: string) => `id="${namespace}-${id}"`)
    .replace(/="url\(#([^)]+)\)"/g, (_, id: string) => `="url(#${namespace}-${id})"`)
    .replace(
      'aria-labelledby="cardTitle cardDesc"',
      `aria-labelledby="${namespace}-cardTitle ${namespace}-cardDesc"`,
    );
}
