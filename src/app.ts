import { Elysia, t, type Context, type UnwrapSchema } from "elysia";
import { cors } from "@elysia/cors";
import { openapi } from "@elysia/openapi";
import { serverTiming } from "@elysia/server-timing";
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
import { themes } from "./utils";
import { renderThemeGallery } from "./gallery";
import { version } from "../package.json";

const USERNAME_PATTERN = "^[a-zA-Z0-9-]{1,39}$";
const CACHE_CONTROL_HEADER = "public, max-age=0, s-maxage=1800, stale-while-revalidate=1800";
const EDGE_CACHE_CONTROL_HEADER = "public, s-maxage=1800, stale-while-revalidate=1800";
const DEFAULT_AFFILIATIONS = "owner" as const;
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
  fields: t.Optional(t.Array(t.String())),
  hide: t.Optional(t.Array(t.String())),
  hide_langs: t.Optional(t.Array(t.String())),
  show_langs: t.Optional(t.Array(t.String())),
  lang_count: t.Optional(t.Integer({ minimum: 1, maximum: 10 })),
  scope: t.Optional(t.Union([t.Literal("personal"), t.Literal("org"), t.Literal("all")])),
  affiliations: t.Optional(t.Union([t.Literal("owner"), t.Literal("affiliated")])),
  orgs: t.Optional(t.Array(t.String())),
});

const CardParamsSchema = t.Object({ username: t.String({ pattern: USERNAME_PATTERN }) });
const ErrorSchema = t.Object({ error: t.String() });
const CardResponseSchema = {
  200: t.String({ description: "SVG markup" }),
  304: t.String(),
  401: ErrorSchema,
  404: ErrorSchema,
  429: ErrorSchema,
  502: ErrorSchema,
};

type CardQuery = UnwrapSchema<typeof CardQuerySchema>;
type ResponseSet = Context["set"];

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

function buildCardOptions(query: CardQuery, hide: string[]): CardOpts {
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
    hide_langs: query.hide_langs,
    show_langs: query.show_langs,
    animate: query.animate ?? false,
  };
}

function fetchProfile(username: string, query: CardQuery) {
  return getProfileData(username, {
    includeLanguages: shouldIncludeLanguages(parseFieldSet(query.fields)),
    langCount: query.lang_count ?? 5,
    hideLangs: query.hide_langs,
    showLangs: query.show_langs,
    scope: query.scope ?? "personal",
    affiliations: query.affiliations ?? DEFAULT_AFFILIATIONS,
    orgs: parseOrgs(query.orgs),
  });
}

async function buildCardSvg(username: string, query: CardQuery): Promise<string> {
  const data = await fetchProfile(username, query);
  return renderCard(
    data.user,
    data.stats,
    data.languages,
    buildCardOptions(query, parseHiddenStats(query.hide)),
  );
}

function applyCacheHeaders(set: ResponseSet) {
  set.headers["Cache-Control"] = CACHE_CONTROL_HEADER;
  set.headers["CDN-Cache-Control"] = EDGE_CACHE_CONTROL_HEADER;
  set.headers["Vercel-CDN-Cache-Control"] = EDGE_CACHE_CONTROL_HEADER;
}

function setSvgHeaders(svg: string, ifNoneMatch: string | undefined, set: ResponseSet): string {
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

export const app = new Elysia({ name: "github-card" })
  .onError(NotFoundError, ({ error, status }) => status(404, { error: error.message }))
  .onError(RateLimitError, ({ error, status }) => status(429, { error: error.message }))
  .onError(AuthError, ({ error, status }) => status(401, { error: error.message }))
  .onError(UpstreamError, ({ error, status }) => status(502, { error: error.message }))
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
          version,
          description:
            "Generate GitHub profile SVG cards for README, web embeds, and social previews.",
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
    () => ({
      message: "GitHub Profile Card API",
      usage: "GET /card/:username",
      themes: "GET /:username/themes",
      docs: "/openapi",
    }),
  )
  .get(
    "/meta",
    {
      detail: { tags: ["Meta"], summary: "API metadata" },
    },
    () => ({
      message: "GitHub Profile Card API",
      usage: "GET /card/:username",
      themes: Object.keys(themes).join(", "),
      affiliations: "owner (default), affiliated",
      organizationSupport: "Use /card/:organization-login",
    }),
  )
  .get(
    "/:username/themes",
    {
      detail: { tags: ["Card"], summary: "Render all built-in themes for a username" },
      params: CardParamsSchema,
      query: CardQuerySchema,
      response: CardResponseSchema,
    },
    async ({ params: { username }, query, headers, set }) => {
      const data = await fetchProfile(username, query);
      const svg = renderThemeGallery(
        data.user,
        data.stats,
        data.languages,
        buildCardOptions(query, parseHiddenStats(query.hide)),
      );

      return setSvgHeaders(svg, headers["if-none-match"], set);
    },
  )
  .get(
    "/health",
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
    async () => {
      const cache = getCacheMetrics();
      const redisReachable = await isRedisReachable();
      return {
        status: "ok",
        uptimeSeconds: Math.floor((Date.now() - appStartedAt) / 1000),
        runtime: Bun.env.VERCEL ? "vercel-function" : "bun",
        region: Bun.env.VERCEL_REGION || null,
        cache,
        redisReachable,
      };
    },
  )
  .get(
    "/card/:username",
    {
      detail: { tags: ["Card"], summary: "Render GitHub profile card SVG" },
      params: CardParamsSchema,
      query: CardQuerySchema,
      response: CardResponseSchema,
    },
    async ({ params: { username }, query, headers, set }) => {
      const svg = await buildCardSvg(username, query);
      return setSvgHeaders(svg, headers["if-none-match"], set);
    },
  );

export type App = typeof app;
