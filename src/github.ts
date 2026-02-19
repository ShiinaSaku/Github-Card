import type { ProfileData, LanguageStat } from "./types";

export class NotFoundError extends Error {
  constructor(message = "User not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class RateLimitError extends Error {
  constructor(message = "GitHub API rate limit exceeded") {
    super(message);
    this.name = "RateLimitError";
  }
}

export class AuthError extends Error {
  constructor(message = "GitHub authentication failed") {
    super(message);
    this.name = "AuthError";
  }
}

export class UpstreamError extends Error {
  constructor(message = "GitHub API request failed") {
    super(message);
    this.name = "UpstreamError";
  }
}

function classifyGraphQLError(message: string): Error | null {
  const lower = message.toLowerCase();

  if (
    lower.includes("could not resolve to a user") ||
    lower.includes("not found") ||
    lower.includes("couldn't find user")
  ) {
    return new NotFoundError("User not found");
  }

  if (lower.includes("rate limit") || lower.includes("api rate limit exceeded")) {
    return new RateLimitError("GitHub API rate limit exceeded");
  }

  if (
    lower.includes("bad credentials") ||
    lower.includes("requires authentication") ||
    lower.includes("resource not accessible")
  ) {
    return new AuthError("GitHub authentication failed");
  }

  return null;
}

function classifyHttpError(status: number, bodyText: string): Error {
  const lower = bodyText.toLowerCase();

  if (status === 401 || lower.includes("bad credentials")) {
    return new AuthError("GitHub authentication failed");
  }

  if (status === 403 && (lower.includes("rate limit") || lower.includes("abuse detection"))) {
    return new RateLimitError("GitHub API rate limit exceeded");
  }

  if (status === 404) {
    return new NotFoundError("User not found");
  }

  return new UpstreamError(`GitHub API error (${status})`);
}

function getHeaders() {
  const token = Bun.env.GITHUB_TOKEN;
  if (!token) throw new AuthError("GITHUB_TOKEN is missing");
  return {
    Authorization: `bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "github-card",
  };
}

const LANG_FIELDS = `languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
          edges { size node { color name } }
        }`;

const USER_META_FIELDS = `
    login name avatarUrl bio pronouns twitterUsername
    openPRs: pullRequests(states: OPEN) { totalCount }
    closedPRs: pullRequests(states: CLOSED) { totalCount }
    mergedPRs: pullRequests(states: MERGED) { totalCount }
    openIssues: issues(states: OPEN) { totalCount }
    closedIssues: issues(states: CLOSED) { totalCount }
    contributionsCollection(from: $from, to: $to) { totalCommitContributions }`;

function buildUserReposQuery(langs: boolean): string {
  return `query userInfo($login: String!, $cursor: String, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    ${USER_META_FIELDS}
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false, orderBy: {direction: DESC, field: STARGAZERS}, after: $cursor) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        stargazers { totalCount }
        ${langs ? LANG_FIELDS : ""}
      }
    }
  }
}`;
}

function buildOrgContribsQuery(langs: boolean): string {
  return `query orgContribs($login: String!, $cursor: String) {
  user(login: $login) {
    repositoriesContributedTo(
      first: 100
      contributionTypes: [COMMIT, PULL_REQUEST, REPOSITORY]
      includeUserRepositories: false
      after: $cursor
    ) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        owner { login __typename }
        stargazers { totalCount }
        ${langs ? LANG_FIELDS : ""}
      }
    }
  }
}`;
}

const QUERY_USER_META = `
query userMeta($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    ${USER_META_FIELDS}
  }
}`;

const CACHE_FRESH_SECONDS = 30 * 60;
const CACHE_STALE_SECONDS = 30 * 60;
const FETCH_TIMEOUT_MS = 8000;
const MAX_PAGES = 10; // Safety: 10 pages × 100 items = 1000 max
type CacheEntry = {
  staleAt: number;
  expiresAt: number;
  value?: ProfileData;
  inFlight?: Promise<ProfileData>;
};
const cache = new Map<string, CacheEntry>();

type FetchOptions = {
  includeLanguages?: boolean;
  langCount?: number;
  scope?: "personal" | "org" | "all";
  orgs?: string[];
  forceRefresh?: boolean;
};

function normalizeScope(value?: string): "personal" | "org" | "all" {
  if (value === "org" || value === "all") return value;
  return "personal";
}

const redisUrl = Bun.env.UPSTASH_REDIS_REST_URL || Bun.env.KV_REST_API_URL || "";
const redisToken = Bun.env.UPSTASH_REDIS_REST_TOKEN || Bun.env.KV_REST_API_TOKEN || "";
let redisPromise: Promise<import("@upstash/redis").Redis | null> | null = null;

function buildCacheKey(raw: string): string {
  return Bun.hash(raw).toString(36);
}

async function getRedis() {
  if (!redisUrl || !redisToken) return null;
  if (!redisPromise) {
    redisPromise = import("@upstash/redis")
      .then((mod) => new mod.Redis({ url: redisUrl, token: redisToken }))
      .catch(() => null);
  }
  return redisPromise;
}

export function getCacheMetrics() {
  const now = Date.now();
  let fresh = 0;
  let stale = 0;
  let expired = 0;

  for (const entry of cache.values()) {
    if (entry.expiresAt <= now) {
      expired++;
      continue;
    }
    if (entry.staleAt <= now) stale++;
    else fresh++;
  }

  return {
    total: cache.size,
    fresh,
    stale,
    expired,
    ttlFreshSeconds: CACHE_FRESH_SECONDS,
    ttlStaleSeconds: CACHE_STALE_SECONDS,
  };
}

export async function isRedisReachable(): Promise<boolean> {
  const redis = await getRedis();
  if (!redis) return false;
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}

function getCacheState(cacheKey: string): { value: ProfileData; stale: boolean } | null {
  const entry = cache.get(cacheKey);
  if (!entry || !entry.value) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(cacheKey);
    return null;
  }
  return { value: entry.value, stale: entry.staleAt <= Date.now() };
}

function setCache(cacheKey: string, value: ProfileData) {
  const now = Date.now();
  cache.set(cacheKey, {
    staleAt: now + CACHE_FRESH_SECONDS * 1000,
    expiresAt: now + (CACHE_FRESH_SECONDS + CACHE_STALE_SECONDS) * 1000,
    value,
  });
}

function accumulateLanguageEdges(
  edges: Array<{ size: number; node: { color?: string; name?: string } }> = [],
  map: Map<string, { size: number; color: string }>,
) {
  for (const edge of edges) {
    if (!edge?.node?.name || !edge.size) continue;
    const current = map.get(edge.node.name);
    if (current) {
      current.size += edge.size;
    } else {
      map.set(edge.node.name, { size: edge.size, color: edge.node.color || "#ccc" });
    }
  }
}

type LangMap = Map<string, { size: number; color: string }>;

/** Merges multiple language maps into one, summing sizes for duplicates. */
function mergeLangMaps(...maps: (LangMap | null)[]): LangMap {
  const merged: LangMap = new Map();
  for (const map of maps) {
    if (!map) continue;
    for (const [name, val] of map) {
      const cur = merged.get(name);
      if (cur) cur.size += val.size;
      else merged.set(name, { size: val.size, color: val.color });
    }
  }
  return merged;
}

/** Sorts a language map by size descending to produce final LanguageStat[]. */
function buildLanguageStats(map: LangMap, limit: number): LanguageStat[] {
  return Array.from(map)
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, limit)
    .map(([name, { size, color }]) => ({ name, size, color }));
}

async function postGraphQL(query: string, variables: Record<string, unknown>): Promise<any> {
  let res: Response;
  try {
    res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: getHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      body: JSON.stringify({ query, variables }),
    });
  } catch (error: any) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      throw new UpstreamError("GitHub API request timed out");
    }
    throw new UpstreamError("GitHub API request failed");
  }

  if (!res.ok) {
    const text = await res.text();
    throw classifyHttpError(res.status, text);
  }

  const body = (await res.json()) as { data?: Record<string, any>; errors?: Array<{ message: string }> };
  if (body.errors?.length) {
    const msg =
      body.errors
        .map((e) => e.message)
        .filter(Boolean)
        .join(" | ") || "GitHub API error";
    throw classifyGraphQLError(msg) || new UpstreamError(msg);
  }

  if (!body.data) {
    throw new UpstreamError("GitHub API returned no data");
  }

  return body;
}

type RepoResult = { stars: number; repos: number; langMap: LangMap | null };
type PersonalResult = RepoResult & { user: any };

/** Fetches an avatar image and returns it as a base64 data URI. */
async function fetchAvatarDataUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": "github-card" },
    });
    if (!res.ok) return url;
    const buf = await res.arrayBuffer();
    const mime = res.headers.get("content-type") || "image/png";
    return `data:${mime};base64,${Buffer.from(buf).toString("base64")}`;
  } catch {
    return url; // fallback to raw URL
  }
}

/** Fetches user metadata only (no repos). */
async function fetchUserMeta(username: string, from: string, to: string): Promise<any> {
  const body = await postGraphQL(QUERY_USER_META, { login: username, from, to });
  if (!body.data?.user) throw new NotFoundError("User not found");
  return body.data.user;
}

/** Paginates user-owned repos and returns stars, repo count, language map, and user metadata. */
async function fetchPersonalRepos(
  username: string,
  langs: boolean,
  from: string,
  to: string,
): Promise<PersonalResult> {
  const query = buildUserReposQuery(langs);
  const langMap: LangMap | null = langs ? new Map() : null;
  let hasNext = true;
  let cursor: string | null = null;
  let user: any = null;
  let stars = 0;
  let repos = 0;
  let page = 0;

  while (hasNext && page++ < MAX_PAGES) {
    const body = await postGraphQL(query, { login: username, cursor, from, to });
    if (!body.data?.user) throw new NotFoundError("User not found");
    if (!user) user = body.data.user;

    const r = body.data.user.repositories;
    if (!repos) repos = r?.totalCount || 0;
    for (const node of r?.nodes || []) {
      stars += node?.stargazers?.totalCount || 0;
      if (langMap) accumulateLanguageEdges(node?.languages?.edges || [], langMap);
    }

    hasNext = Boolean(r?.pageInfo?.hasNextPage);
    cursor = r?.pageInfo?.endCursor ?? null;
    if (!r?.nodes?.length) hasNext = false;
  }

  return { user, stars, repos, langMap };
}

/**
 * Fetches repos the user actually contributed to (commits, PRs, or owns)
 * that are owned by organizations — not the user themselves.
 * Filters by org login when `orgsFilter` is non-empty.
 */
async function fetchOrgContributions(
  username: string,
  langs: boolean,
  orgsFilter: string[],
): Promise<RepoResult> {
  const query = buildOrgContribsQuery(langs);
  const langMap: LangMap | null = langs ? new Map() : null;
  const filterSet = orgsFilter.length > 0 ? new Set(orgsFilter) : null;
  let hasNext = true;
  let cursor: string | null = null;
  let stars = 0;
  let repos = 0;
  let page = 0;

  while (hasNext && page++ < MAX_PAGES) {
    const body = await postGraphQL(query, { login: username, cursor });
    if (!body.data?.user) throw new NotFoundError("User not found");

    const c = body.data.user.repositoriesContributedTo;
    for (const repo of c?.nodes || []) {
      if (repo?.owner?.__typename !== "Organization") continue;
      if (filterSet && !filterSet.has(repo.owner.login.toLowerCase())) continue;
      stars += repo.stargazers?.totalCount || 0;
      repos += 1;
      if (langMap) accumulateLanguageEdges(repo.languages?.edges || [], langMap);
    }

    hasNext = Boolean(c?.pageInfo?.hasNextPage);
    cursor = c?.pageInfo?.endCursor || null;
    if (!c?.nodes?.length) hasNext = false;
  }

  return { stars, repos, langMap };
}

export async function getProfileData(
  username: string,
  opts: FetchOptions = {},
): Promise<ProfileData> {
  const includeLanguages = opts.includeLanguages ?? true;
  const langCount = Math.min(10, Math.max(1, opts.langCount ?? 5));
  const scope = normalizeScope(opts.scope);
  const forceRefresh = opts.forceRefresh ?? false;
  const orgs = Array.from(new Set((opts.orgs || []).map((org) => org.trim()).filter(Boolean)))
    .map((org) => org.toLowerCase())
    .sort();
  const cacheRaw = `v2:${username}:${scope}:${includeLanguages ? "langs" : "nolangs"}:${langCount}:${orgs.join("|")}`;
  const cacheKey = buildCacheKey(cacheRaw);

  if (!forceRefresh) {
    const cached = getCacheState(cacheKey);
    if (cached && !cached.stale) return cached.value;

    if (cached?.stale) {
      const existingStale = cache.get(cacheKey);
      if (existingStale && !existingStale.inFlight) {
        existingStale.inFlight = (async () => {
          try {
            const refreshed = await getProfileData(username, {
              includeLanguages,
              langCount,
              scope,
              orgs,
              forceRefresh: true,
            });
            return refreshed;
          } catch {
            return cached.value;
          } finally {
            const current = cache.get(cacheKey);
            if (current) current.inFlight = undefined;
          }
        })();
      }
      return cached.value;
    }
  }

  const redis = await getRedis();
  if (!forceRefresh && redis) {
    try {
      const redisValue = await redis.get<ProfileData>(`profile:${cacheKey}`);
      if (redisValue) {
        setCache(cacheKey, redisValue);
        return redisValue;
      }
    } catch {}
  }

  const existing = cache.get(cacheKey);
  if (!forceRefresh && existing?.inFlight) return existing.inFlight;

  const inFlight = (async () => {
    try {
      const now = new Date();
      const from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
      const to = now.toISOString();

      // Parallel data fetching based on scope
      let user: any;
      let pStars = 0,
        pRepos = 0,
        oStars = 0,
        oRepos = 0;
      let pLangs: LangMap | null = null;
      let oLangs: LangMap | null = null;

      if (scope === "personal") {
        const r = await fetchPersonalRepos(username, includeLanguages, from, to);
        user = r.user;
        pStars = r.stars;
        pRepos = r.repos;
        pLangs = r.langMap;
      } else if (scope === "org") {
        const [meta, org] = await Promise.all([
          fetchUserMeta(username, from, to),
          fetchOrgContributions(username, includeLanguages, orgs),
        ]);
        user = meta;
        oStars = org.stars;
        oRepos = org.repos;
        oLangs = org.langMap;
      } else {
        // scope === "all" — fetch personal + org in parallel
        const [personal, org] = await Promise.all([
          fetchPersonalRepos(username, includeLanguages, from, to),
          fetchOrgContributions(username, includeLanguages, orgs),
        ]);
        user = personal.user;
        pStars = personal.stars;
        pRepos = personal.repos;
        pLangs = personal.langMap;
        oStars = org.stars;
        oRepos = org.repos;
        oLangs = org.langMap;
      }

      const languages = includeLanguages
        ? buildLanguageStats(mergeLangMaps(pLangs, oLangs), langCount)
        : [];

      // Embed avatar as base64 data URI for reliable rendering in <img> contexts
      const avatarSized = user.avatarUrl + (user.avatarUrl.includes("?") ? "&" : "?") + "s=200";
      const avatarDataUrl = await fetchAvatarDataUrl(avatarSized);

      const profile: ProfileData = {
        user: {
          login: user.login,
          name: user.name,
          avatarUrl: avatarDataUrl,
          bio: user.bio,
          pronouns: user.pronouns,
          twitter: user.twitterUsername,
        },
        stats: {
          stars: scope === "org" ? oStars : pStars + oStars,
          repos: scope === "org" ? oRepos : pRepos + oRepos,
          prs:
            (user.openPRs?.totalCount || 0) +
            (user.closedPRs?.totalCount || 0) +
            (user.mergedPRs?.totalCount || 0),
          issues: (user.openIssues?.totalCount || 0) + (user.closedIssues?.totalCount || 0),
          commits: user.contributionsCollection?.totalCommitContributions || 0,
        },
        languages,
      };

      setCache(cacheKey, profile);
      if (redis) {
        try {
          await redis.set(`profile:${cacheKey}`, profile, {
            ex: CACHE_FRESH_SECONDS + CACHE_STALE_SECONDS,
          });
        } catch {}
      }
      return profile;
    } catch (err) {
      cache.delete(cacheKey);
      throw err;
    }
  })();

  cache.set(cacheKey, {
    staleAt: Date.now() + CACHE_FRESH_SECONDS * 1000,
    expiresAt: Date.now() + (CACHE_FRESH_SECONDS + CACHE_STALE_SECONDS) * 1000,
    inFlight,
  });
  return inFlight;
}
