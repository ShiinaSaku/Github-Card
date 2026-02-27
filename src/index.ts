import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { serverTiming } from "@elysiajs/server-timing";
import type { Resvg } from "@resvg/resvg-js";
import {
  AuthError,
  getCacheMetrics,
  getProfileData,
  isRedisReachable,
  NotFoundError,
  RateLimitError,
  UpstreamError,
} from "./github";
import { renderCard, type CardOpts } from "./card";
import { escapeXml, themes } from "./utils";

const USERNAME_PATTERN = "^[a-zA-Z0-9-]{1,39}$";
const CACHE_CONTROL_HEADER = "public, max-age=0, s-maxage=1800, stale-while-revalidate=1800";
const EDGE_CACHE_CONTROL_HEADER = "public, s-maxage=1800, stale-while-revalidate=1800";
const appStartedAt = Date.now();

const CardQuerySchema = t.Object({
  theme: t.Optional(t.String()),
  title_color: t.Optional(t.String()),
  text_color: t.Optional(t.String()),
  icon_color: t.Optional(t.String()),
  bg_color: t.Optional(t.String()),
  border_color: t.Optional(t.String()),
  hide_border: t.Optional(t.BooleanString()),
  compact: t.Optional(t.BooleanString()),
  animate: t.Optional(t.BooleanString()),
  variant: t.Optional(t.Union([t.Literal("classic"), t.Literal("hyper")])),
  fields: t.Optional(t.ArrayQuery(t.String())),
  hide: t.Optional(t.ArrayQuery(t.String())),
  lang_count: t.Optional(t.Integer({ minimum: 1, maximum: 10 })),
  scope: t.Optional(t.Union([t.Literal("personal"), t.Literal("org"), t.Literal("all")])),
  affiliations: t.Optional(t.Union([t.Literal("owner"), t.Literal("affiliated")])),
  orgs: t.Optional(t.ArrayQuery(t.String())),
});

const OgQuerySchema = t.Object({
  ...CardQuerySchema.properties,
  width: t.Optional(t.Integer({ minimum: 640, maximum: 2400 })),
  height: t.Optional(t.Integer({ minimum: 320, maximum: 1400 })),
});

type CardQuery = typeof CardQuerySchema.static;
type OgQuery = typeof OgQuerySchema.static;
type MutableSet = {
  status?: number | string;
  headers: Record<string, string | undefined>;
};

function normalizeList(values?: string[]): string[] {
  if (!values?.length) return [];
  return values.map((value) => value.trim()).filter(Boolean);
}

function parseHiddenStats(values?: string[]): string[] {
  const allowed = new Set(["stars", "commits", "issues", "repos", "prs"]);
  return Array.from(
    new Set(
      normalizeList(values)
        .map((value) => value.toLowerCase())
        .filter((value) => allowed.has(value)),
    ),
  );
}

function parseScope(value?: string): "personal" | "org" | "all" {
  if (value === "org" || value === "all") return value;
  return "personal";
}

function parseOrgs(values?: string[]): string[] {
  return Array.from(new Set(normalizeList(values).map((value) => value.toLowerCase())));
}

function parseFieldSet(values?: string[]): Set<string> | null {
  const list = normalizeList(values).map((value) => value.toLowerCase());
  return list.length ? new Set(list) : null;
}

function shouldIncludeLanguages(fields: Set<string> | null): boolean {
  if (!fields) return true;
  return fields.has("all") || fields.has("languages") || fields.has("langs");
}

function buildCardOptions(
  query: CardQuery,
  hide: string[],
  variantOverride?: "classic" | "hyper",
): CardOpts {
  return {
    theme: query.theme,
    title_color: query.title_color,
    text_color: query.text_color,
    icon_color: query.icon_color,
    bg_color: query.bg_color,
    border_color: query.border_color,
    hide_border: query.hide_border ?? false,
    compact: query.compact ?? false,
    hide,
    animate: query.animate ?? false,
    variant: variantOverride ?? query.variant ?? "classic",
  };
}

async function buildCardSvg(
  username: string,
  query: CardQuery,
  variantOverride?: "classic" | "hyper",
): Promise<string> {
  const langCount = query.lang_count ?? 5;
  const hiddenStats = parseHiddenStats(query.hide);
  const scope = parseScope(query.scope);
  const orgs = parseOrgs(query.orgs);
  const fields = parseFieldSet(query.fields);
  const includeLanguages = shouldIncludeLanguages(fields);
  const affiliations = query.affiliations ?? "affiliated";

  const data = await getProfileData(username, {
    includeLanguages,
    langCount,
    scope,
    affiliations,
    orgs,
  });

  return renderCard(
    data.user,
    data.stats,
    data.languages,
    buildCardOptions(query, hiddenStats, variantOverride),
  );
}

function renderUserThemesSvg(
  user: Parameters<typeof renderCard>[0],
  stats: Parameters<typeof renderCard>[1],
  langs: Parameters<typeof renderCard>[2],
  cardOpts: Parameters<typeof renderCard>[3],
) {
  const entries = Object.keys(themes);
  const cols = 2;
  const gap = 20;
  const cardW = 500;
  const cardH = 200;
  const labelH = 22;
  const cellH = cardH + labelH;
  const rows = Math.ceil(entries.length / cols);
  const width = cols * cardW + (cols + 1) * gap;
  const height = rows * cellH + (rows + 1) * gap;

  const blocks = entries
    .map((name, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = gap + col * (cardW + gap);
      const y = gap + row * (cellH + gap);
      const cardSvg = renderCard(user, stats, langs, { ...cardOpts, theme: name });
      const encoded = encodeURIComponent(cardSvg).replace(/'/g, "%27").replace(/"/g, "%22");

      return `<g transform="translate(${x},${y})">
        <text x="4" y="14" fill="#e2e8f0" font-size="13" font-family="Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial" font-weight="700">${name}</text>
        <image href="data:image/svg+xml;utf8,${encoded}" x="0" y="${labelH}" width="${cardW}" height="${cardH}"/>
      </g>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="GitHub Card themes for user">
  <rect width="100%" height="100%" fill="#0b1220"/>
  ${blocks}
</svg>`;
}

function applyCacheHeaders(set: MutableSet) {
  set.headers["Cache-Control"] = CACHE_CONTROL_HEADER;
  set.headers["CDN-Cache-Control"] = EDGE_CACHE_CONTROL_HEADER;
  set.headers["Vercel-CDN-Cache-Control"] = EDGE_CACHE_CONTROL_HEADER;
}

function setSvgHeaders(svg: string, ifNoneMatch: string | undefined, set: MutableSet): string {
  const etag = `W/"${Bun.hash(svg).toString(36)}"`;
  if (ifNoneMatch === etag) {
    set.status = 304;
    set.headers.ETag = etag;
    applyCacheHeaders(set);
    return "";
  }

  set.headers["Content-Type"] = "image/svg+xml";
  set.headers.ETag = etag;
  applyCacheHeaders(set);
  return svg;
}

function renderOgCanvasSvg(cardSvg: string, username: string, width: number, height: number): string {
  const encodedCard = encodeURIComponent(cardSvg).replace(/'/g, "%27").replace(/"/g, "%22");
  const cardW = 500;
  const cardH = 200;
  const scale = Math.min((width * 0.78) / cardW, (height * 0.68) / cardH);
  const placedW = cardW * scale;
  const placedH = cardH * scale;
  const x = (width - placedW) / 2;
  const y = (height - placedH) / 2 + 26;
  const label = escapeXml(username);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#090f1f"/>
      <stop offset="55%" stop-color="#101f44"/>
      <stop offset="100%" stop-color="#0c2f2e"/>
    </linearGradient>
    <radialGradient id="orbA" cx="18%" cy="14%" r="56%">
      <stop offset="0%" stop-color="#44d3ff" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#44d3ff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="orbB" cx="82%" cy="80%" r="60%">
      <stop offset="0%" stop-color="#33ffaa" stop-opacity="0.32"/>
      <stop offset="100%" stop-color="#33ffaa" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect width="100%" height="100%" fill="url(#orbA)"/>
  <rect width="100%" height="100%" fill="url(#orbB)"/>
  <text x="52" y="86" fill="#9dc6ff" font-size="30" font-family="Inter,ui-sans-serif,system-ui" font-weight="700">github-card :: ${label}</text>
  <text x="52" y="126" fill="#8fb0d8" font-size="22" font-family="Inter,ui-sans-serif,system-ui" opacity="0.8">share-ready profile card</text>
  <image href="data:image/svg+xml;utf8,${encodedCard}" x="${x}" y="${y}" width="${placedW}" height="${placedH}"/>
</svg>`;
}

let resvgModulePromise: Promise<{ Resvg: typeof Resvg } | null> | null = null;

async function getResvgModule() {
  if (!resvgModulePromise) {
    resvgModulePromise = import("@resvg/resvg-js")
      .then((mod) => ({ Resvg: mod.Resvg }))
      .catch(() => null);
  }
  return resvgModulePromise;
}

async function renderPng(svg: string): Promise<Uint8Array> {
  const mod = await getResvgModule();
  if (!mod) throw new UpstreamError("PNG renderer unavailable");

  const resvg = new mod.Resvg(svg, {
    fitTo: { mode: "original" },
    imageRendering: 0,
  });

  return resvg.render().asPng();
}

const app = new Elysia({ name: "github-card" })
  .error({
    NOT_FOUND_ERROR: NotFoundError,
    RATE_LIMIT_ERROR: RateLimitError,
    AUTH_ERROR: AuthError,
    UPSTREAM_ERROR: UpstreamError,
  })
  .onError(({ code, error, set }) => {
    switch (code) {
      case "NOT_FOUND_ERROR":
        set.status = 404;
        return { error: error.message };
      case "RATE_LIMIT_ERROR":
        set.status = 429;
        return { error: error.message };
      case "AUTH_ERROR":
        set.status = 401;
        return { error: error.message };
      case "UPSTREAM_ERROR":
        set.status = 502;
        return { error: error.message };
    }
  })
  .use(
    cors({
      origin: true,
      methods: ["GET", "OPTIONS"],
      allowedHeaders: ["Content-Type", "If-None-Match"],
      exposeHeaders: ["ETag", "Cache-Control", "Content-Type"],
      maxAge: 86400,
      credentials: false,
    }),
  )
  .use(
    openapi({
      documentation: {
        info: {
          title: "GitHub Profile Card API",
          version: "1.5.0",
          description:
            "Generate GitHub profile SVG/PNG cards for README, web embeds, and social previews.",
        },
        tags: [
          { name: "Card", description: "Card endpoints" },
          { name: "Meta", description: "Service metadata" },
          { name: "Ops", description: "Operational endpoints" },
        ],
      },
    }),
  )
  .use(serverTiming())
  .get(
    "/",
    () => ({
      message: "GitHub Profile Card API",
      usage: "GET /card/:username",
      themes: "GET /:username/themes",
      docs: "/openapi",
    }),
    {
      detail: { tags: ["Meta"], summary: "API metadata" },
      response: {
        200: t.Object({
          message: t.String(),
          usage: t.String(),
          themes: t.String(),
          docs: t.String(),
        }),
      },
    },
  )
  .get(
    "/meta",
    () => ({
      message: "GitHub Profile Card API",
      usage: "GET /card/:username",
      themes:
        "default, dark, radical, merko, gruvbox, tokyonight, onedark, cobalt, synthwave, highcontrast, dracula, monokai, nord, github_dark, pearl, slate, forest, rose, sand",
      variants: "classic, hyper",
      socialPreview: "GET /og/:username",
      affiliations: "affiliated (default), owner",
      organizationSupport: "Use /card/:organization-login",
    }),
    {
      detail: { tags: ["Meta"], summary: "API metadata" },
    },
  )
  .get(
    "/:username/themes",
    async ({ params: { username }, query, headers, set }) => {
      const q = query as CardQuery;
      const scope = parseScope(q.scope);
      const orgs = parseOrgs(q.orgs);
      const fields = parseFieldSet(q.fields);
      const includeLanguages = shouldIncludeLanguages(fields);
      const data = await getProfileData(username, {
        includeLanguages,
        langCount: q.lang_count ?? 5,
        scope,
        affiliations: q.affiliations ?? "affiliated",
        orgs,
      });

      const svg = renderUserThemesSvg(data.user, data.stats, data.languages, {
        compact: q.compact ?? false,
        hide_border: q.hide_border ?? false,
        hide: parseHiddenStats(q.hide),
        animate: q.animate ?? false,
        variant: q.variant ?? "classic",
      });

      return setSvgHeaders(svg, headers["if-none-match"], set as MutableSet);
    },
    {
      detail: { tags: ["Card"], summary: "Render all built-in themes for a username" },
      params: t.Object({ username: t.String({ pattern: USERNAME_PATTERN }) }),
      query: CardQuerySchema,
      response: {
        200: t.String({ description: "SVG markup" }),
        304: t.String(),
        401: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        429: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
        502: t.Object({ error: t.String() }),
      },
    },
  )
  .get(
    "/health",
    async () => {
      const cache = getCacheMetrics();
      const redisReachable = await isRedisReachable();
      return {
        status: "ok",
        uptimeSeconds: Math.floor((Date.now() - appStartedAt) / 1000),
        runtime: "vercel-function",
        region: Bun.env.VERCEL_REGION || null,
        cache,
        redisReachable,
      };
    },
    {
      detail: { tags: ["Ops"], summary: "Service health and cache telemetry" },
      response: {
        200: t.Object({
          status: t.String(),
          uptimeSeconds: t.Number(),
          runtime: t.String(),
          region: t.Union([t.String(), t.Null()]),
          cache: t.Object({
            total: t.Number(),
            maxEntries: t.Number(),
            fresh: t.Number(),
            stale: t.Number(),
            expired: t.Number(),
            ttlFreshSeconds: t.Number(),
            ttlStaleSeconds: t.Number(),
          }),
          redisReachable: t.Boolean(),
        }),
      },
    },
  )
  .get(
    "/card/:username",
    async ({ params: { username }, query, headers, set }) => {
      const svg = await buildCardSvg(username, query as CardQuery);
      return setSvgHeaders(svg, headers["if-none-match"], set as MutableSet);
    },
    {
      detail: { tags: ["Card"], summary: "Render GitHub profile card SVG" },
      params: t.Object({ username: t.String({ pattern: USERNAME_PATTERN }) }),
      query: CardQuerySchema,
      response: {
        200: t.String({ description: "SVG markup" }),
        304: t.String(),
        401: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        429: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
        502: t.Object({ error: t.String() }),
      },
    },
  )
  .get(
    "/card/:username/next",
    async ({ params: { username }, query, headers, set }) => {
      const q = query as CardQuery;
      const svg = await buildCardSvg(
        username,
        { ...q, variant: "hyper", animate: q.animate ?? true },
        "hyper",
      );
      return setSvgHeaders(svg, headers["if-none-match"], set as MutableSet);
    },
    {
      detail: { tags: ["Card"], summary: "Render hyper visual variant" },
      params: t.Object({ username: t.String({ pattern: USERNAME_PATTERN }) }),
      query: CardQuerySchema,
      response: {
        200: t.String({ description: "SVG markup" }),
        304: t.String(),
        401: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        429: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
        502: t.Object({ error: t.String() }),
      },
    },
  )
  .get(
    "/og/:username",
    async ({ params: { username }, query, headers, set }) => {
      const q = query as OgQuery;
      const width = q.width ?? 1200;
      const height = q.height ?? 630;
      const baseCard = await buildCardSvg(
        username,
        {
          ...q,
          compact: q.compact ?? false,
          variant: q.variant ?? "hyper",
          animate: q.animate ?? true,
        },
        "hyper",
      );

      const ogSvg = renderOgCanvasSvg(baseCard, username, width, height);
      const png = await renderPng(ogSvg);
      const etag = `W/"${Bun.hash(png).toString(36)}"`;
      if (headers["if-none-match"] === etag) {
        set.status = 304;
        set.headers.ETag = etag;
        applyCacheHeaders(set as MutableSet);
        return new Uint8Array();
      }

      set.headers["Content-Type"] = "image/png";
      set.headers.ETag = etag;
      applyCacheHeaders(set as MutableSet);
      return png;
    },
    {
      detail: { tags: ["Card"], summary: "Render social preview PNG" },
      params: t.Object({ username: t.String({ pattern: USERNAME_PATTERN }) }),
      query: OgQuerySchema,
      response: {
        200: t.Any(),
        304: t.Any(),
        401: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        429: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
        502: t.Object({ error: t.String() }),
      },
    },
  );

if (import.meta.main) {
  const port = Number(Bun.env.PORT || 3000);
  app.listen(port);
  console.log(`Dev server running on http://localhost:${port}`);
}

export default app;
