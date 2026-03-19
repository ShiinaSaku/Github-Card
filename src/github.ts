import type { ProfileData, LanguageStat } from "./types";
import { RedisClient } from "bun";

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

function classifyError(message: string, status?: number): Error {
  const lower = message.toLowerCase();
  if (status === 404 || lower.includes("not resolve to a user") || lower.includes("not found"))
    return new NotFoundError();
  if (status === 429 || status === 403 || lower.includes("rate limit") || lower.includes("abuse"))
    return new RateLimitError();
  if (
    status === 401 ||
    lower.includes("bad credentials") ||
    lower.includes("requires authentication")
  )
    return new AuthError();
  return new UpstreamError(message || `GitHub API error (${status || 500})`);
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

const CACHE_FRESH_MS = 30 * 60 * 1000;
const CACHE_STALE_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 6000;
const MAX_PAGES = 10;
const MAX_L1_ENTRIES = 1000;
const REDIS_PROFILE_PREFIX = "profile:";

let redisClient: RedisClient | null = null;
try {
  if (Bun.env.REDIS_URL) {
    redisClient = new RedisClient(Bun.env.REDIS_URL);
  }
} catch (e) {
  console.error("Bun RedisClient failed to initialize", e);
}

export async function isRedisReachable(): Promise<boolean> {
  if (!redisClient) return false;
  try {
    return (await redisClient.ping()) === "PONG";
  } catch {
    return false;
  }
}

type CachedData = {
  v: number;
  staleAt: number;
  expiresAt: number;
  data: ProfileData;
};

const memCache = new Map<string, CachedData>();
const inFlight = new Map<string, Promise<ProfileData>>();

export function getCacheMetrics() {
  let fresh = 0;
  let stale = 0;
  let expired = 0;
  const now = Date.now();
  for (const entry of memCache.values()) {
    if (entry.expiresAt <= now) expired++;
    else if (entry.staleAt <= now) stale++;
    else fresh++;
  }
  return {
    total: memCache.size,
    maxEntries: MAX_L1_ENTRIES,
    fresh,
    stale,
    expired,
    ttlFreshSeconds: 1800,
    ttlStaleSeconds: 1800,
  };
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

type FetchOptions = {
  includeLanguages?: boolean;
  langCount?: number;
  scope?: "personal" | "org" | "all";
  orgs?: string[];
  affiliations?: "owner" | "affiliated";
  forceRefresh?: boolean;
};

const QUERY_PROFILE = `
query fullProfile($login: String!, $from: DateTime!, $to: DateTime!, $isPersonal: Boolean!, $isOrg: Boolean!, $fetchLangs: Boolean!, $affiliations: [RepositoryAffiliation!]) {
  user(login: $login) {
    login name avatarUrl bio pronouns twitterUsername
    openPRs: pullRequests(states: OPEN) { totalCount }
    closedPRs: pullRequests(states: CLOSED) { totalCount }
    mergedPRs: pullRequests(states: MERGED) { totalCount }
    openIssues: issues(states: OPEN) { totalCount }
    closedIssues: issues(states: CLOSED) { totalCount }
    contributionsCollection(from: $from, to: $to) { 
      totalCommitContributions 
      commitContributionsByRepository(maxRepositories: 100) @include(if: $isOrg) { repository { owner { login __typename } } contributions(first:1) { totalCount } }
      pullRequestContributionsByRepository(maxRepositories: 100) @include(if: $isOrg) { repository { owner { login __typename } } contributions(first:1) { totalCount } }
      issueContributionsByRepository(maxRepositories: 100) @include(if: $isOrg) { repository { owner { login __typename } } contributions(first:1) { totalCount } }
    }
    repositories(first: 100, ownerAffiliations: $affiliations, isFork: false, orderBy: {direction: DESC, field: STARGAZERS}) @include(if: $isPersonal) {
      pageInfo { hasNextPage endCursor }
      nodes { nameWithOwner stargazers { totalCount } languages(first: 10, orderBy: {field: SIZE, direction: DESC}) @include(if: $fetchLangs) { edges { size node { color name } } } }
    }
    repositoriesContributedTo(first: 100, contributionTypes: [COMMIT, PULL_REQUEST, REPOSITORY], includeUserRepositories: false) @include(if: $isOrg) {
      pageInfo { hasNextPage endCursor }
      nodes { nameWithOwner owner { login __typename } stargazers { totalCount } languages(first: 10, orderBy: {field: SIZE, direction: DESC}) @include(if: $fetchLangs) { edges { size node { color name } } } }
    }
  }
}
`;

const QUERY_ORG = `
query fullOrg($login: String!, $fetchLangs: Boolean!) {
  organization(login: $login) {
    login name avatarUrl description twitterUsername
    repositories(first: 100, isFork: false, orderBy: {direction: DESC, field: STARGAZERS}) {
      pageInfo { hasNextPage endCursor }
      nodes { nameWithOwner stargazers { totalCount } languages(first: 10, orderBy: {field: SIZE, direction: DESC}) @include(if: $fetchLangs) { edges { size node { color name } } } }
    }
  }
}
`;

const QUERY_PAGINATE_USER_REPOS = `
query paginateRepos($login: String!, $cursor: String, $affiliations: [RepositoryAffiliation!], $fetchLangs: Boolean!) {
  user(login: $login) {
    repositories(first: 100, after: $cursor, ownerAffiliations: $affiliations, isFork: false, orderBy: {direction: DESC, field: STARGAZERS}) {
      pageInfo { hasNextPage endCursor }
      nodes { nameWithOwner stargazers { totalCount } languages(first: 10, orderBy: {field: SIZE, direction: DESC}) @include(if: $fetchLangs) { edges { size node { color name } } } }
    }
  }
}
`;

const QUERY_PAGINATE_ORG_CONTRIBS = `
query paginateOrgContribs($login: String!, $cursor: String, $fetchLangs: Boolean!) {
  user(login: $login) {
    repositoriesContributedTo(first: 100, contributionTypes: [COMMIT, PULL_REQUEST, REPOSITORY], includeUserRepositories: false, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { nameWithOwner owner { login __typename } stargazers { totalCount } languages(first: 10, orderBy: {field: SIZE, direction: DESC}) @include(if: $fetchLangs) { edges { size node { color name } } } }
    }
  }
}
`;

const QUERY_PAGINATE_ORG_REPOS = `
query paginateOrg($login: String!, $cursor: String, $fetchLangs: Boolean!) {
  organization(login: $login) {
    repositories(first: 100, isFork: false, orderBy: {direction: DESC, field: STARGAZERS}, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { nameWithOwner stargazers { totalCount } languages(first: 10, orderBy: {field: SIZE, direction: DESC}) @include(if: $fetchLangs) { edges { size node { color name } } } }
    }
  }
}
`;

async function postGraphQL(query: string, variables: Record<string, unknown>) {
  let res: Response;
  try {
    res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: getHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      body: JSON.stringify({ query, variables }),
    });
  } catch (error: any) {
    if (error.name === "TimeoutError" || error.name === "AbortError")
      throw new UpstreamError("GitHub API timeout");
    throw new UpstreamError("GitHub API failed");
  }
  if (!res.ok) throw classifyError(await res.text(), res.status);
  const body = (await res.json()) as any;
  if (body.errors?.length) throw classifyError(body.errors[0].message);
  if (!body.data) throw new UpstreamError("No data");
  return body.data;
}

type LangMap = Map<string, { size: number; color: string }>;
function accLangs(edges: any[], map: LangMap) {
  if (!edges) return;
  for (const e of edges) {
    if (!e?.node?.name || !e.size) continue;
    const cur = map.get(e.node.name);
    if (cur) cur.size += e.size;
    else map.set(e.node.name, { size: e.size, color: e.node.color || "#ccc" });
  }
}

async function fetchAvatarAsBase64(url: string | null | undefined): Promise<string> {
  if (!url) return "";
  try {
    const target = new URL(url);
    target.searchParams.set("s", "150");
    const res = await fetch(target.toString(), { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return url;
    const buf = await res.arrayBuffer();
    return `data:${res.headers.get("content-type") || "image/png"};base64,${Buffer.from(buf).toString("base64")}`;
  } catch {
    return url;
  }
}

function sumContributions(entries: any[], orgsSet: Set<string> | null) {
  let tot = 0;
  for (const e of entries || []) {
    const owner = e?.repository?.owner;
    if (owner?.__typename !== "Organization" || !owner?.login) continue;
    if (orgsSet && !orgsSet.has(owner.login.toLowerCase())) continue;
    tot += e?.contributions?.totalCount || 0;
  }
  return tot;
}

async function directFetch(username: string, opts: FetchOptions): Promise<ProfileData> {
  const isPersonal = opts.scope !== "org";
  const isOrg = opts.scope === "org" || opts.scope === "all";
  const fetchLangs = opts.includeLanguages ?? true;
  const orgsArr = opts.orgs || [];
  const orgsSet =
    orgsArr.length > 0 ? new Set(orgsArr.map((o) => o.trim().toLowerCase()).filter(Boolean)) : null;
  const affiliations =
    opts.affiliations === "owner" ? ["OWNER"] : ["OWNER", "ORGANIZATION_MEMBER", "COLLABORATOR"];

  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
  const to = now.toISOString();

  let user: any = null;
  let isOrgAccount = false;
  try {
    const data = await postGraphQL(QUERY_PROFILE, {
      login: username,
      from,
      to,
      isPersonal,
      isOrg,
      fetchLangs,
      affiliations,
    });
    user = data.user;
    if (!user) throw new NotFoundError();
  } catch (err) {
    if (err instanceof NotFoundError) {
      const data = await postGraphQL(QUERY_ORG, { login: username, fetchLangs });
      user = data.organization;
      if (!user) throw new NotFoundError();
      isOrgAccount = true;
    } else throw err;
  }

  const langMap: LangMap = new Map();
  const seenRepos = new Set<string>();
  let stars = 0;
  let reposCount = 0;

  const processNode = (n: any, scopeCheck: boolean) => {
    if (!n || !n.nameWithOwner || seenRepos.has(n.nameWithOwner)) return;
    if (
      scopeCheck &&
      n.owner?.__typename === "Organization" &&
      orgsSet &&
      !orgsSet.has(n.owner.login.toLowerCase())
    )
      return;
    seenRepos.add(n.nameWithOwner);
    stars += n.stargazers?.totalCount || 0;
    reposCount++;
    if (fetchLangs) accLangs(n.languages?.edges, langMap);
  };

  const traversePages = async (connection: any, query: string, scopeCheck: boolean) => {
    let hasNext = connection?.pageInfo?.hasNextPage;
    let cursor = connection?.pageInfo?.endCursor;
    let page = 1;
    for (const n of connection?.nodes || []) processNode(n, scopeCheck);

    while (hasNext && cursor && page++ < MAX_PAGES) {
      const data = await postGraphQL(query, { login: username, cursor, fetchLangs, affiliations });
      const nextConn = data.user
        ? query.includes("repositoriesContributedTo")
          ? data.user.repositoriesContributedTo
          : data.user.repositories
        : data.organization?.repositories;
      for (const n of nextConn?.nodes || []) processNode(n, scopeCheck);
      hasNext = nextConn?.pageInfo?.hasNextPage;
      cursor = nextConn?.pageInfo?.endCursor;
    }
  };

  const tasks: Promise<void>[] = [];
  if (!isOrgAccount) {
    if (isPersonal) tasks.push(traversePages(user.repositories, QUERY_PAGINATE_USER_REPOS, false));
    if (isOrg)
      tasks.push(traversePages(user.repositoriesContributedTo, QUERY_PAGINATE_ORG_CONTRIBS, true));
  } else {
    tasks.push(traversePages(user.repositories, QUERY_PAGINATE_ORG_REPOS, false));
  }

  const [avatarDataUrl] = await Promise.all([fetchAvatarAsBase64(user.avatarUrl), ...tasks]);

  let commits = 0;
  let prs = 0;
  let issues = 0;

  if (!isOrgAccount) {
    const c = user.contributionsCollection;
    if (opts.scope === "org") {
      commits = sumContributions(c?.commitContributionsByRepository, orgsSet);
      prs = sumContributions(c?.pullRequestContributionsByRepository, orgsSet);
      issues = sumContributions(c?.issueContributionsByRepository, orgsSet);
    } else {
      commits = c?.totalCommitContributions || 0;
      prs =
        (user.openPRs?.totalCount || 0) +
        (user.closedPRs?.totalCount || 0) +
        (user.mergedPRs?.totalCount || 0);
      issues = (user.openIssues?.totalCount || 0) + (user.closedIssues?.totalCount || 0);
    }
  }

  const languages = Array.from(langMap.entries())
    .map(([name, { size, color }]) => ({ name, size, color }))
    .sort((a, b) => b.size - a.size)
    .slice(0, opts.langCount || 5);

  return {
    user: {
      login: user.login,
      name: user.name,
      avatarUrl: avatarDataUrl,
      bio: user.bio || user.description,
      pronouns: user.pronouns,
      twitter: user.twitterUsername,
    },
    stats: { stars, repos: reposCount, prs, issues, commits },
    languages,
  };
}

export async function getProfileData(
  username: string,
  opts: FetchOptions = {},
): Promise<ProfileData> {
  const norm = normalizeUsername(username);
  const cacheKey = Bun.hash(
    `v6:${norm}:${opts.scope || "personal"}:${opts.affiliations || "affiliated"}:${opts.includeLanguages !== false}:${opts.langCount || 5}:${(opts.orgs || []).sort().join("|")}`,
  ).toString(36);

  if (!opts.forceRefresh) {
    const mem = memCache.get(cacheKey);
    const now = Date.now();
    if (mem && mem.expiresAt > now) {
      if (mem.staleAt <= now && !inFlight.has(cacheKey))
        triggerBackgroundRefresh(username, opts, cacheKey);
      return mem.data;
    }

    if (redisClient) {
      try {
        const raw = await redisClient.get(`${REDIS_PROFILE_PREFIX}${cacheKey}`);
        if (raw) {
          const parsed = JSON.parse(raw) as CachedData;
          if (parsed.expiresAt > now) {
            memCache.set(cacheKey, parsed);
            if (memCache.size > MAX_L1_ENTRIES)
              memCache.delete(memCache.keys().next().value as string);
            if (parsed.staleAt <= now && !inFlight.has(cacheKey))
              triggerBackgroundRefresh(username, opts, cacheKey);
            return parsed.data;
          }
        }
      } catch {}
    }
  }

  if (inFlight.has(cacheKey)) return inFlight.get(cacheKey)!;

  const promise = directFetch(username, opts)
    .then(async (data) => {
      const payload: CachedData = {
        v: 6,
        staleAt: Date.now() + CACHE_FRESH_MS,
        expiresAt: Date.now() + CACHE_FRESH_MS + CACHE_STALE_MS,
        data,
      };
      memCache.set(cacheKey, payload);
      if (memCache.size > MAX_L1_ENTRIES) memCache.delete(memCache.keys().next().value as string);
      if (redisClient) {
        try {
          await redisClient.set(
            `${REDIS_PROFILE_PREFIX}${cacheKey}`,
            JSON.stringify(payload),
            "EX",
            3600,
          );
        } catch {}
      }
      inFlight.delete(cacheKey);
      return data;
    })
    .catch((err) => {
      inFlight.delete(cacheKey);
      throw err;
    });

  inFlight.set(cacheKey, promise);
  return promise;
}

function triggerBackgroundRefresh(username: string, opts: FetchOptions, cacheKey: string) {
  const promise = directFetch(username, { ...opts, forceRefresh: true })
    .then(async (data) => {
      const payload: CachedData = {
        v: 6,
        staleAt: Date.now() + CACHE_FRESH_MS,
        expiresAt: Date.now() + CACHE_FRESH_MS + CACHE_STALE_MS,
        data,
      };
      memCache.set(cacheKey, payload);
      if (redisClient) {
        try {
          await redisClient.set(
            `${REDIS_PROFILE_PREFIX}${cacheKey}`,
            JSON.stringify(payload),
            "EX",
            3600,
          );
        } catch {}
      }
      inFlight.delete(cacheKey);
      return data;
    })
    .catch(() => {
      inFlight.delete(cacheKey);
    });
  inFlight.set(cacheKey, promise as Promise<ProfileData>);
}
