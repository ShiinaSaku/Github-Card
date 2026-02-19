import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { serverTiming } from "@elysiajs/server-timing";
import {
  AuthError,
  getCacheMetrics,
  getProfileData,
  isRedisReachable,
  NotFoundError,
  RateLimitError,
  UpstreamError,
} from "./github";
import { renderCard } from "./card";
import { themes } from "./utils";

const USERNAME_PATTERN = "^[a-zA-Z0-9-]{1,39}$";
const appStartedAt = Date.now();

function parseLangCount(value?: string): number {
  if (!value) return 5;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return 5;
  return Math.min(10, Math.max(1, parsed));
}

function parseHiddenStats(value?: string): string[] {
  if (!value) return [];
  const allowed = new Set(["stars", "commits", "issues", "repos", "prs"]);
  return Array.from(
    new Set(
      value
        .split(",")
        .map((v) => v.trim().toLowerCase())
        .filter((v) => allowed.has(v)),
    ),
  );
}

function parseScope(value?: string): "personal" | "org" | "all" {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "org" || normalized === "all") return normalized;
  return "personal";
}

function parseOrgs(value?: string): string[] {
  if (!value) return [];
  return Array.from(
    new Set(
      value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    ),
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
          version: "1.3.0",
          description: "Generate GitHub profile SVG cards for README and web embeds.",
        },
        tags: [
          { name: "Card", description: "SVG card endpoints" },
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
    }),
    {
      detail: { tags: ["Meta"], summary: "API metadata" },
    },
  )
  .get(
    "/:username/themes",
    async ({ params: { username }, query, headers, set }) => {
      const langCount = parseLangCount(query.lang_count);
      const hiddenStats = parseHiddenStats(query.hide);
      const scope = parseScope(query.scope);
      const orgs = parseOrgs(query.orgs);
      const fields = query.fields
        ? new Set(
            query.fields
              .split(",")
              .map((v) => v.trim().toLowerCase())
              .filter(Boolean),
          )
        : null;
      const includeLanguages =
        !fields || fields.has("all") || fields.has("languages") || fields.has("langs");
      const data = await getProfileData(username, { includeLanguages, langCount, scope, orgs });
      const svg = renderUserThemesSvg(data.user, data.stats, data.languages, {
        compact: query.compact === "true",
        hide_border: query.hide_border === "true",
        hide: hiddenStats,
      });
      const etag = `W/"${Bun.hash(svg).toString(36)}"`;
      if (headers["if-none-match"] === etag) {
        set.status = 304;
        set.headers["ETag"] = etag;
        set.headers["Cache-Control"] =
          "public, max-age=0, s-maxage=1800, stale-while-revalidate=1800";
        return "";
      }

      set.headers["Content-Type"] = "image/svg+xml";
      set.headers["ETag"] = etag;
      set.headers["Cache-Control"] =
        "public, max-age=0, s-maxage=1800, stale-while-revalidate=1800";
      return svg;
    },
    {
      detail: { tags: ["Card"], summary: "Render all built-in themes for a username" },
      params: t.Object({ username: t.String({ pattern: USERNAME_PATTERN }) }),
      query: t.Object({
        compact: t.Optional(t.String()),
        hide_border: t.Optional(t.String()),
        fields: t.Optional(t.String()),
        hide: t.Optional(t.String()),
        lang_count: t.Optional(t.String()),
        scope: t.Optional(t.Union([t.Literal("personal"), t.Literal("org"), t.Literal("all")])),
        orgs: t.Optional(t.String()),
      }),
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
      const langCount = parseLangCount(query.lang_count);
      const hiddenStats = parseHiddenStats(query.hide);
      const scope = parseScope(query.scope);
      const orgs = parseOrgs(query.orgs);
      const fields = query.fields
        ? new Set(
            query.fields
              .split(",")
              .map((v) => v.trim().toLowerCase())
              .filter(Boolean),
          )
        : null;
      const includeLanguages =
        !fields || fields.has("all") || fields.has("languages") || fields.has("langs");
      const data = await getProfileData(username, { includeLanguages, langCount, scope, orgs });
      const svg = renderCard(data.user, data.stats, data.languages, {
        theme: query.theme,
        title_color: query.title_color,
        text_color: query.text_color,
        icon_color: query.icon_color,
        bg_color: query.bg_color,
        border_color: query.border_color,
        hide_border: query.hide_border === "true",
        compact: query.compact === "true",
        hide: hiddenStats,
      });
      const etag = `W/"${Bun.hash(svg).toString(36)}"`;
      if (headers["if-none-match"] === etag) {
        set.status = 304;
        set.headers["ETag"] = etag;
        set.headers["Cache-Control"] =
          "public, max-age=0, s-maxage=1800, stale-while-revalidate=1800";
        return "";
      }

      set.headers["Content-Type"] = "image/svg+xml";
      set.headers["ETag"] = etag;
      set.headers["Cache-Control"] =
        "public, max-age=0, s-maxage=1800, stale-while-revalidate=1800";
      return svg;
    },
    {
      detail: { tags: ["Card"], summary: "Render GitHub profile card SVG" },
      params: t.Object({ username: t.String({ pattern: USERNAME_PATTERN }) }),
      query: t.Object({
        theme: t.Optional(t.String()),
        title_color: t.Optional(t.String()),
        text_color: t.Optional(t.String()),
        icon_color: t.Optional(t.String()),
        bg_color: t.Optional(t.String()),
        border_color: t.Optional(t.String()),
        hide_border: t.Optional(t.String()),
        compact: t.Optional(t.String()),
        fields: t.Optional(t.String()),
        hide: t.Optional(t.String()),
        lang_count: t.Optional(t.String()),
        scope: t.Optional(t.Union([t.Literal("personal"), t.Literal("org"), t.Literal("all")])),
        orgs: t.Optional(t.String()),
      }),
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
  );

if (import.meta.main) {
  const port = Number(Bun.env.PORT || 3000);
  app.listen(port);
  console.log(`Dev server running on http://localhost:${port}`);
}

export default app;
