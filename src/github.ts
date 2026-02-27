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

type AffiliationMode = "owner" | "affiliated";

function buildUserReposQuery(langs: boolean, affiliations: AffiliationMode): string {
  const ownerAffiliations =
    affiliations === "owner" ? "[OWNER]" : "[OWNER, ORGANIZATION_MEMBER, COLLABORATOR]";

  return `query userInfo($login: String!, $cursor: String, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    ${USER_META_FIELDS}
    repositories(first: 100, ownerAffiliations: ${ownerAffiliations}, isFork: false, orderBy: {direction: DESC, field: STARGAZERS}, after: $cursor) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        nameWithOwner
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
        nameWithOwner
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

const ORG_META_FIELDS = `
    login name avatarUrl description twitterUsername`;

function buildOrganizationReposQuery(langs: boolean): string {
  return `query orgInfo($login: String!, $cursor: String) {
  organization(login: $login) {
    ${ORG_META_FIELDS}
    repositories(first: 100, isFork: false, orderBy: {direction: DESC, field: STARGAZERS}, after: $cursor) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        nameWithOwner
        stargazers { totalCount }
        ${langs ? LANG_FIELDS : ""}
      }
    }
  }
}`;
}

const QUERY_ORG_SCOPED_CONTRIBS = `
query orgScopedContribs($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      commitContributionsByRepository(maxRepositories: 100) {
        repository { owner { login __typename } }
        contributions(first: 1) { totalCount }
      }
      pullRequestContributionsByRepository(maxRepositories: 100) {
        repository { owner { login __typename } }
        contributions(first: 1) { totalCount }
      }
      issueContributionsByRepository(maxRepositories: 100) {
        repository { owner { login __typename } }
        contributions(first: 1) { totalCount }
      }
    }
  }
}`;

const CACHE_FRESH_SECONDS = 30 * 60;
const CACHE_STALE_SECONDS = 30 * 60;
const FETCH_TIMEOUT_MS = 8000;
const MAX_PAGES = 10; // Safety: 10 pages × 100 items = 1000 max
const MAX_L1_ENTRIES = 500;
const REFRESH_LOCK_SECONDS = 20;
const REDIS_PROFILE_PREFIX = "profile:";
const REDIS_LOCK_PREFIX = "profile-lock:";
type CacheEntry = {
  updatedAt: number;
  staleAt: number;
  expiresAt: number;
  value?: ProfileData;
  inFlight?: Promise<ProfileData>;
};
const cache = new Map<string, CacheEntry>();

type CachedProfilePayload = {
  version: 3;
  staleAt: number;
  expiresAt: number;
  value: ProfileData;
};

type FetchOptions = {
  includeLanguages?: boolean;
  langCount?: number;
  scope?: "personal" | "org" | "all";
  orgs?: string[];
  affiliations?: AffiliationMode;
  forceRefresh?: boolean;
};

type ScopedContributionStats = {
  prs: number;
  issues: number;
  commits: number;
};

type GraphQLErrorItem = { message: string };
type GraphQLResponse<T> = { data?: T; errors?: GraphQLErrorItem[] };

type GraphQLUserMeta = {
  login: string;
  name: string | null;
  avatarUrl: string;
  bio: string | null;
  pronouns: string | null;
  twitterUsername: string | null;
  openPRs?: { totalCount?: number };
  closedPRs?: { totalCount?: number };
  mergedPRs?: { totalCount?: number };
  openIssues?: { totalCount?: number };
  closedIssues?: { totalCount?: number };
  contributionsCollection?: { totalCommitContributions?: number };
};

type RepoNode = {
  nameWithOwner?: string;
  stargazers?: { totalCount?: number };
  languages?: { edges?: RepoLangEdge[] };
  owner?: { login?: string; __typename?: string };
};

type UserReposData = {
  user?: GraphQLUserMeta & {
    repositories?: {
      totalCount?: number;
      pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
      nodes?: RepoNode[];
    };
  };
};

type OrgContribsData = {
  user?: {
    repositoriesContributedTo?: {
      totalCount?: number;
      pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
      nodes?: RepoNode[];
    };
  };
};

type UserMetaData = { user?: GraphQLUserMeta };

type OrgInfoData = {
  organization?: {
    login: string;
    name: string | null;
    avatarUrl: string;
    description: string | null;
    twitterUsername: string | null;
    repositories?: {
      totalCount?: number;
      pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
      nodes?: RepoNode[];
    };
  };
};

type OrgScopedContribData = {
  user?: {
    contributionsCollection?: {
      commitContributionsByRepository?: Array<{
        repository?: { owner?: { login?: string; __typename?: string } };
        contributions?: { totalCount?: number };
      }>;
      pullRequestContributionsByRepository?: Array<{
        repository?: { owner?: { login?: string; __typename?: string } };
        contributions?: { totalCount?: number };
      }>;
      issueContributionsByRepository?: Array<{
        repository?: { owner?: { login?: string; __typename?: string } };
        contributions?: { totalCount?: number };
      }>;
    };
  };
};

function normalizeScope(value?: string): "personal" | "org" | "all" {
  if (value === "org" || value === "all") return value;
  return "personal";
}

function normalizeAffiliations(value?: string): AffiliationMode {
  return value === "owner" ? "owner" : "affiliated";
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
    maxEntries: MAX_L1_ENTRIES,
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

function pruneL1CacheIfNeeded() {
  if (cache.size <= MAX_L1_ENTRIES) return;

  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }

  while (cache.size > MAX_L1_ENTRIES) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    cache.delete(oldest);
  }
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function createCachePayload(value: ProfileData, now = Date.now()): CachedProfilePayload {
  return {
    version: 3,
    staleAt: now + CACHE_FRESH_SECONDS * 1000,
    expiresAt: now + (CACHE_FRESH_SECONDS + CACHE_STALE_SECONDS) * 1000,
    value,
  };
}

function coerceCachePayload(raw: unknown): CachedProfilePayload | null {
  if (!raw || typeof raw !== "object") return null;

  const record = raw as Record<string, unknown>;
  if (
    typeof record.staleAt === "number" &&
    typeof record.expiresAt === "number" &&
    record.value &&
    typeof record.value === "object"
  ) {
    return {
      version: 3,
      staleAt: record.staleAt,
      expiresAt: record.expiresAt,
      value: record.value as ProfileData,
    };
  }

  // Backward compatibility: previous Redis values stored ProfileData directly.
  if (
    typeof record.user === "object" &&
    typeof record.stats === "object" &&
    Array.isArray(record.languages)
  ) {
    return createCachePayload(record as unknown as ProfileData);
  }

  return null;
}

function setCache(cacheKey: string, payload: CachedProfilePayload) {
  cache.set(cacheKey, {
    updatedAt: Date.now(),
    staleAt: payload.staleAt,
    expiresAt: payload.expiresAt,
    value: payload.value,
  });
  pruneL1CacheIfNeeded();
}

function primeInFlight(cacheKey: string, inFlight: Promise<ProfileData>) {
  const now = Date.now();
  cache.set(cacheKey, {
    updatedAt: now,
    staleAt: now + CACHE_FRESH_SECONDS * 1000,
    expiresAt: now + (CACHE_FRESH_SECONDS + CACHE_STALE_SECONDS) * 1000,
    inFlight,
  });
  pruneL1CacheIfNeeded();
}

async function tryAcquireRefreshLock(cacheKey: string): Promise<boolean> {
  const redis = await getRedis();
  if (!redis) return true;
  try {
    const res = await redis.set(`${REDIS_LOCK_PREFIX}${cacheKey}`, "1", {
      ex: REFRESH_LOCK_SECONDS,
      nx: true,
    });
    return res === "OK";
  } catch {
    // If Redis is degraded, continue without distributed lock.
    return true;
  }
}

async function releaseRefreshLock(cacheKey: string) {
  const redis = await getRedis();
  if (!redis) return;
  try {
    await redis.del(`${REDIS_LOCK_PREFIX}${cacheKey}`);
  } catch {}
}

async function waitForRedisWarm(cacheKey: string): Promise<CachedProfilePayload | null> {
  const redis = await getRedis();
  if (!redis) return null;

  for (let attempt = 0; attempt < 4; attempt++) {
    await Bun.sleep(75 * (attempt + 1));
    try {
      const redisValue = await redis.get<unknown>(`${REDIS_PROFILE_PREFIX}${cacheKey}`);
      const payload = coerceCachePayload(redisValue);
      if (!payload || payload.expiresAt <= Date.now()) continue;
      return payload;
    } catch {}
  }

  return null;
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

async function postGraphQL<T>(
  query: string,
  variables: Record<string, unknown>,
  options: { allowPartialData?: boolean } = {},
): Promise<GraphQLResponse<T>> {
  let res: Response;
  try {
    res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: getHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      body: JSON.stringify({ query, variables }),
    });
  } catch (error: unknown) {
    const name = (error as { name?: string } | null)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      throw new UpstreamError("GitHub API request timed out");
    }
    throw new UpstreamError("GitHub API request failed");
  }

  if (!res.ok) {
    const text = await res.text();
    throw classifyHttpError(res.status, text);
  }

  const body = (await res.json()) as GraphQLResponse<T>;
  if (body.errors?.length && !(options.allowPartialData && body.data)) {
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

type RepoLangEdge = { size: number; node: { color?: string; name?: string } };
type RepoSnapshot = { key: string; stars: number; langEdges: RepoLangEdge[] };
type RepoMap = Map<string, RepoSnapshot>;

type RepoResult = { stars: number; repos: number; langMap: LangMap | null };
type PersonalResult = { user: GraphQLUserMeta; repos: RepoMap };
type OrganizationMeta = {
  login: string;
  name: string | null;
  avatarUrl: string;
  description: string | null;
  twitterUsername: string | null;
};
type OrgAccountResult = { organization: OrganizationMeta; repos: RepoMap };

function isScopedOrgRepo(
  repoOwner: { login?: string; __typename?: string } | null | undefined,
  orgFilter: Set<string> | null,
): boolean {
  if (!repoOwner || repoOwner.__typename !== "Organization" || !repoOwner.login) return false;
  if (!orgFilter) return true;
  return orgFilter.has(repoOwner.login.toLowerCase());
}

function sumScopedContribution(
  entries: Array<{
    repository?: { owner?: { login?: string; __typename?: string } };
    contributions?: { totalCount?: number };
  }> = [],
  orgFilter: Set<string> | null,
): number {
  let total = 0;
  for (const entry of entries) {
    if (!isScopedOrgRepo(entry?.repository?.owner, orgFilter)) continue;
    total += entry?.contributions?.totalCount || 0;
  }
  return total;
}

function toRepoKey(value?: string): string | null {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  return key.length > 0 ? key : null;
}

function addRepoToMap(
  map: RepoMap,
  keyInput: string | undefined,
  stars: number,
  langEdges: RepoLangEdge[] | undefined,
) {
  const key = toRepoKey(keyInput);
  if (!key || map.has(key)) return;
  map.set(key, {
    key,
    stars: Number.isFinite(stars) ? stars : 0,
    langEdges: Array.isArray(langEdges) ? langEdges : [],
  });
}

function summarizeRepoMap(map: RepoMap, includeLanguages: boolean): RepoResult {
  let stars = 0;
  const langMap: LangMap | null = includeLanguages ? new Map() : null;

  for (const repo of map.values()) {
    stars += repo.stars;
    if (langMap) accumulateLanguageEdges(repo.langEdges, langMap);
  }

  return { stars, repos: map.size, langMap };
}

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
async function fetchUserMeta(username: string, from: string, to: string): Promise<GraphQLUserMeta> {
  const body = await postGraphQL<UserMetaData>(QUERY_USER_META, { login: username, from, to });
  if (!body.data?.user) throw new NotFoundError("User not found");
  return body.data.user;
}

/** Paginates user-owned repos and returns stars, repo count, language map, and user metadata. */
async function fetchPersonalRepos(
  username: string,
  langs: boolean,
  affiliations: AffiliationMode,
  from: string,
  to: string,
): Promise<PersonalResult> {
  const query = buildUserReposQuery(langs, affiliations);
  const repos: RepoMap = new Map();
  let hasNext = true;
  let cursor: string | null = null;
  let user: GraphQLUserMeta | null = null;
  let page = 0;

  while (hasNext && page++ < MAX_PAGES) {
    const body: GraphQLResponse<UserReposData> = await postGraphQL<UserReposData>(query, {
      login: username,
      cursor,
      from,
      to,
    });
    if (!body.data?.user) throw new NotFoundError("User not found");
    const userData = body.data.user;
    if (!user) user = userData;

    const r = userData.repositories;
    const nodes = r?.nodes || [];
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index];
      addRepoToMap(
        repos,
        node?.nameWithOwner || `user:${username}:${page}:${index}`,
        node?.stargazers?.totalCount || 0,
        node?.languages?.edges || [],
      );
    }

    hasNext = Boolean(r?.pageInfo?.hasNextPage);
    cursor = r?.pageInfo?.endCursor ?? null;
    if (!r?.nodes?.length) hasNext = false;
  }

  if (!user) throw new NotFoundError("User not found");
  return { user, repos };
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
): Promise<{ repos: RepoMap }> {
  const query = buildOrgContribsQuery(langs);
  const repos: RepoMap = new Map();
  const filterSet = orgsFilter.length > 0 ? new Set(orgsFilter) : null;
  let hasNext = true;
  let cursor: string | null = null;
  let page = 0;

  while (hasNext && page++ < MAX_PAGES) {
    const body: GraphQLResponse<OrgContribsData> = await postGraphQL<OrgContribsData>(query, {
      login: username,
      cursor,
    });
    if (!body.data?.user) throw new NotFoundError("User not found");
    const userData = body.data.user;
    const c = userData.repositoriesContributedTo;
    const nodes = c?.nodes || [];
    for (let index = 0; index < nodes.length; index++) {
      const repo = nodes[index];
      if (!isScopedOrgRepo(repo?.owner, filterSet)) continue;
      addRepoToMap(
        repos,
        repo?.nameWithOwner || `org:${repo?.owner?.login || username}:${page}:${index}`,
        repo?.stargazers?.totalCount || 0,
        repo?.languages?.edges || [],
      );
    }

    hasNext = Boolean(c?.pageInfo?.hasNextPage);
    cursor = c?.pageInfo?.endCursor || null;
    if (!c?.nodes?.length) hasNext = false;
  }

  return { repos };
}

async function fetchOrganizationRepos(login: string, langs: boolean): Promise<OrgAccountResult> {
  const query = buildOrganizationReposQuery(langs);
  const repos: RepoMap = new Map();
  let hasNext = true;
  let cursor: string | null = null;
  let organization: OrganizationMeta | null = null;
  let page = 0;

  while (hasNext && page++ < MAX_PAGES) {
    const body: GraphQLResponse<OrgInfoData> = await postGraphQL<OrgInfoData>(query, {
      login,
      cursor,
    });
    if (!body.data?.organization) throw new NotFoundError("User not found");
    const orgData = body.data.organization;
    if (!organization) organization = orgData;

    const r = orgData.repositories;
    const nodes = r?.nodes || [];
    for (let index = 0; index < nodes.length; index++) {
      const repo = nodes[index];
      addRepoToMap(
        repos,
        repo?.nameWithOwner || `organization:${login}:${page}:${index}`,
        repo?.stargazers?.totalCount || 0,
        repo?.languages?.edges || [],
      );
    }

    hasNext = Boolean(r?.pageInfo?.hasNextPage);
    cursor = r?.pageInfo?.endCursor ?? null;
    if (!r?.nodes?.length) hasNext = false;
  }

  if (!organization) throw new NotFoundError("User not found");
  return { organization, repos };
}

async function fetchOrgScopedContributionStats(
  username: string,
  from: string,
  to: string,
  orgsFilter: string[],
): Promise<ScopedContributionStats> {
  const filterSet = orgsFilter.length > 0 ? new Set(orgsFilter) : null;
  const body = await postGraphQL<OrgScopedContribData>(QUERY_ORG_SCOPED_CONTRIBS, {
    login: username,
    from,
    to,
  });
  if (!body.data?.user) throw new NotFoundError("User not found");

  const collection = body.data.user.contributionsCollection;
  return {
    commits: sumScopedContribution(collection?.commitContributionsByRepository, filterSet),
    prs: sumScopedContribution(collection?.pullRequestContributionsByRepository, filterSet),
    issues: sumScopedContribution(collection?.issueContributionsByRepository, filterSet),
  };
}

export async function getProfileData(
  username: string,
  opts: FetchOptions = {},
): Promise<ProfileData> {
  const normalizedUsername = normalizeUsername(username);
  const includeLanguages = opts.includeLanguages ?? true;
  const langCount = Math.min(10, Math.max(1, opts.langCount ?? 5));
  const scope = normalizeScope(opts.scope);
  const affiliations = normalizeAffiliations(opts.affiliations);
  const forceRefresh = opts.forceRefresh ?? false;
  const orgs = Array.from(new Set((opts.orgs || []).map((org) => org.trim()).filter(Boolean)))
    .map((org) => org.toLowerCase())
    .sort();
  const cacheRaw = `v4:${normalizedUsername}:${scope}:${affiliations}:${includeLanguages ? "langs" : "nolangs"}:${langCount}:${orgs.join("|")}`;
  const cacheKey = buildCacheKey(cacheRaw);
  const redis = await getRedis();

  if (!forceRefresh) {
    const cached = getCacheState(cacheKey);
    if (cached && !cached.stale) return cached.value;

    if (cached?.stale) {
      const existingStale = cache.get(cacheKey);
      if (existingStale && !existingStale.inFlight) {
        existingStale.inFlight = (async () => {
          const acquired = await tryAcquireRefreshLock(cacheKey);
          if (!acquired) return cached.value;
          try {
            const refreshed = await getProfileData(username, {
              includeLanguages,
              langCount,
              scope,
              affiliations,
              orgs,
              forceRefresh: true,
            });
            return refreshed;
          } catch {
            return cached.value;
          } finally {
            await releaseRefreshLock(cacheKey);
            const current = cache.get(cacheKey);
            if (current) current.inFlight = undefined;
          }
        })();
      }
      return cached.value;
    }
  }

  if (!forceRefresh && redis) {
    try {
      const redisValue = await redis.get<unknown>(`${REDIS_PROFILE_PREFIX}${cacheKey}`);
      const payload = coerceCachePayload(redisValue);
      if (payload && payload.expiresAt > Date.now()) {
        setCache(cacheKey, payload);
        if (payload.staleAt <= Date.now()) {
          const staleEntry = cache.get(cacheKey);
          if (staleEntry && !staleEntry.inFlight) {
            staleEntry.inFlight = (async () => {
              const acquired = await tryAcquireRefreshLock(cacheKey);
              if (!acquired) return payload.value;
              try {
                return await getProfileData(username, {
                  includeLanguages,
                  langCount,
                  scope,
                  affiliations,
                  orgs,
                  forceRefresh: true,
                });
              } catch {
                return payload.value;
              } finally {
                await releaseRefreshLock(cacheKey);
                const current = cache.get(cacheKey);
                if (current) current.inFlight = undefined;
              }
            })();
          }
        }
        return payload.value;
      }
    } catch {}
  }

  const existing = cache.get(cacheKey);
  if (!forceRefresh && existing?.inFlight) return existing.inFlight;

  let lockAcquired = false;
  if (redis) {
    lockAcquired = await tryAcquireRefreshLock(cacheKey);
    if (!lockAcquired && !forceRefresh) {
      const warmed = await waitForRedisWarm(cacheKey);
      if (warmed) {
        setCache(cacheKey, warmed);
        return warmed.value;
      }
      // If lock holder failed to warm in time, continue with direct fetch.
    }
  }

  const inFlight = (async () => {
    try {
      const now = new Date();
      const from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
      const to = now.toISOString();
      let accountKind: "user" | "organization" = "user";
      let user: GraphQLUserMeta | null = null;
      let stars = 0;
      let repos = 0;
      let langMap: LangMap | null = null;
      let scopedOrgStats: ScopedContributionStats = { prs: 0, issues: 0, commits: 0 };

      try {
        if (scope === "personal") {
          const r = await fetchPersonalRepos(
            normalizedUsername,
            includeLanguages,
            affiliations,
            from,
            to,
          );
          const summarized = summarizeRepoMap(r.repos, includeLanguages);
          user = r.user;
          stars = summarized.stars;
          repos = summarized.repos;
          langMap = summarized.langMap;
        } else if (scope === "org") {
          const [meta, org, orgScoped] = await Promise.all([
            fetchUserMeta(normalizedUsername, from, to),
            fetchOrgContributions(normalizedUsername, includeLanguages, orgs),
            fetchOrgScopedContributionStats(normalizedUsername, from, to, orgs),
          ]);
          const summarized = summarizeRepoMap(org.repos, includeLanguages);
          user = meta;
          stars = summarized.stars;
          repos = summarized.repos;
          langMap = summarized.langMap;
          scopedOrgStats = orgScoped;
        } else {
          // scope === "all" — fetch personal + org in parallel
          const [personal, org] = await Promise.all([
            fetchPersonalRepos(normalizedUsername, includeLanguages, affiliations, from, to),
            fetchOrgContributions(normalizedUsername, includeLanguages, orgs),
          ]);
          const mergedRepos: RepoMap = new Map(personal.repos);
          for (const [key, repo] of org.repos) {
            if (!mergedRepos.has(key)) mergedRepos.set(key, repo);
          }
          const summarized = summarizeRepoMap(mergedRepos, includeLanguages);
          user = personal.user;
          stars = summarized.stars;
          repos = summarized.repos;
          langMap = summarized.langMap;
        }
      } catch (error) {
        if (!(error instanceof NotFoundError)) throw error;

        const organization = await fetchOrganizationRepos(normalizedUsername, includeLanguages);
        const summarized = summarizeRepoMap(organization.repos, includeLanguages);
        accountKind = "organization";
        user = {
          login: organization.organization.login,
          name: organization.organization.name,
          avatarUrl: organization.organization.avatarUrl,
          bio: organization.organization.description,
          pronouns: null,
          twitterUsername: organization.organization.twitterUsername,
        };
        stars = summarized.stars;
        repos = summarized.repos;
        langMap = summarized.langMap;
      }

      if (!user) throw new NotFoundError("User not found");

      const languages = includeLanguages
        ? buildLanguageStats(mergeLangMaps(langMap), langCount)
        : [];

      // Embed avatar as base64 data URI for reliable rendering in <img> contexts
      let avatarSized = String(user.avatarUrl || "");
      try {
        const avatarUrl = new URL(avatarSized);
        avatarUrl.searchParams.set("s", "200");
        avatarSized = avatarUrl.toString();
      } catch {}
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
          stars,
          repos,
          prs:
            accountKind === "organization"
              ? 0
              : scope === "org"
                ? scopedOrgStats.prs
                : (user.openPRs?.totalCount || 0) +
                  (user.closedPRs?.totalCount || 0) +
                  (user.mergedPRs?.totalCount || 0),
          issues:
            accountKind === "organization"
              ? 0
              : scope === "org"
                ? scopedOrgStats.issues
                : (user.openIssues?.totalCount || 0) + (user.closedIssues?.totalCount || 0),
          commits:
            accountKind === "organization"
              ? 0
              : scope === "org"
                ? scopedOrgStats.commits
                : user.contributionsCollection?.totalCommitContributions || 0,
        },
        languages,
      };

      const payload = createCachePayload(profile);
      setCache(cacheKey, payload);
      if (redis) {
        try {
          await redis.set(`${REDIS_PROFILE_PREFIX}${cacheKey}`, payload, {
            ex: CACHE_FRESH_SECONDS + CACHE_STALE_SECONDS,
          });
        } catch {}
      }
      return profile;
    } catch (err) {
      cache.delete(cacheKey);
      throw err;
    } finally {
      if (lockAcquired) {
        await releaseRefreshLock(cacheKey);
      }
    }
  })();

  primeInFlight(cacheKey, inFlight);
  return inFlight;
}
