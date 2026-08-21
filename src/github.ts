import type { ProfileData } from "./types";
import { RedisClient } from "bun";
import {
  GitHubClient,
  NotFoundError,
  RateLimitError,
  AuthError,
  GitHubError as UpstreamError,
} from "./utils/github-client";

export { NotFoundError, RateLimitError, AuthError, UpstreamError };

const githubClient = new GitHubClient({
  token: Bun.env.GITHUB_TOKEN ?? "",
  userAgent: "github-card",
});

const CACHE_FRESH_MS = 30 * 60 * 1000;
const CACHE_STALE_MS = 30 * 60 * 1000;
const CACHE_VERSION = 8;
const REDIS_TTL_SECONDS = Math.ceil((CACHE_FRESH_MS + CACHE_STALE_MS) / 1000);
const FETCH_TIMEOUT_MS = 6000;
const AVATAR_TIMEOUT_MS = 4000;
const MAX_AVATAR_BYTES = 256 * 1024;
const MAX_PAGES = 5;
const REPO_PAGE_SIZE = 100;
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
const refreshInFlight = new Set<string>();

function evictL1IfNeeded() {
  if (memCache.size <= MAX_L1_ENTRIES) return;
  const oldestKey = memCache.keys().next().value as string | undefined;
  if (oldestKey) memCache.delete(oldestKey);
}

function setMemoryCache(cacheKey: string, payload: CachedData) {
  memCache.set(cacheKey, payload);
  evictL1IfNeeded();
}

async function writeRedisCache(cacheKey: string, payload: CachedData) {
  if (!redisClient) return;
  try {
    await redisClient.set(
      `${REDIS_PROFILE_PREFIX}${cacheKey}`,
      JSON.stringify(payload),
      "EX",
      REDIS_TTL_SECONDS,
    );
  } catch {}
}

async function readRedisCache(cacheKey: string, now: number): Promise<CachedData | null> {
  if (!redisClient) return null;
  try {
    const raw = await redisClient.get(`${REDIS_PROFILE_PREFIX}${cacheKey}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedData;
    if (parsed.v !== CACHE_VERSION || parsed.expiresAt <= now || !parsed.data) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function saveProfileCache(cacheKey: string, data: ProfileData): Promise<ProfileData> {
  const now = Date.now();
  const payload: CachedData = {
    v: CACHE_VERSION,
    staleAt: now + CACHE_FRESH_MS,
    expiresAt: now + CACHE_FRESH_MS + CACHE_STALE_MS,
    data,
  };

  setMemoryCache(cacheKey, payload);
  await writeRedisCache(cacheKey, payload);
  return data;
}

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
    ttlFreshSeconds: CACHE_FRESH_MS / 1000,
    ttlStaleSeconds: CACHE_STALE_MS / 1000,
  };
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function normalizeOrgFilters(orgs?: string[]): string[] {
  return Array.from(new Set((orgs || []).map((o) => o.trim().toLowerCase()).filter(Boolean)));
}

type FetchOptions = {
  includeLanguages?: boolean;
  langCount?: number;
  scope?: "personal" | "org" | "all";
  orgs?: string[];
  affiliations?: "owner" | "affiliated";
  forceRefresh?: boolean;
};

type RepoNode = {
  nameWithOwner: string;
  stargazers: { totalCount: number };
  owner?: { login: string; __typename: string } | null;
  languages?: { edges: LangEdge[] | null } | null;
};

type PageInfo = { hasNextPage: boolean; endCursor: string | null };
type RepoConnection = { pageInfo: PageInfo; nodes: RepoNode[] | null };

type ProfileUser = {
  login: string;
  name: string | null;
  avatarUrl: string;
  bio: string | null;
  pronouns: string | null;
  twitterUsername: string | null;
  openPRs: { totalCount: number };
  closedPRs: { totalCount: number };
  mergedPRs: { totalCount: number };
  openIssues: { totalCount: number };
  closedIssues: { totalCount: number };
  contributionsCollection: {
    totalCommitContributions: number;
    commitContributionsByRepository?: ContributionEntry[] | null;
    pullRequestContributionsByRepository?: ContributionEntry[] | null;
    issueContributionsByRepository?: ContributionEntry[] | null;
  };
};

type OrgProfile = {
  login: string;
  name: string | null;
  avatarUrl: string;
  description: string | null;
  twitterUsername: string | null;
};

const QUERY_PROFILE = `
query fullProfile($login: String!, $from: DateTime!, $to: DateTime!, $isOrg: Boolean!) {
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
  }
}
`;

const QUERY_ORG = `
query fullOrg($login: String!) {
  organization(login: $login) {
    login name avatarUrl description twitterUsername
  }
}
`;

const QUERY_PAGINATE_USER_REPOS = `
query paginateRepos($login: String!, $cursor: String, $pageSize: Int!, $affiliations: [RepositoryAffiliation!], $fetchLangs: Boolean!) {
  user(login: $login) {
    repositories(first: $pageSize, after: $cursor, ownerAffiliations: $affiliations, isFork: false, orderBy: {direction: DESC, field: STARGAZERS}) {
      pageInfo { hasNextPage endCursor }
      nodes { nameWithOwner stargazers { totalCount } languages(first: 10, orderBy: {field: SIZE, direction: DESC}) @include(if: $fetchLangs) { edges { size node { color name } } } }
    }
  }
}
`;

const QUERY_PAGINATE_ORG_CONTRIBS = `
query paginateOrgContribs($login: String!, $cursor: String, $pageSize: Int!, $fetchLangs: Boolean!) {
  user(login: $login) {
    repositoriesContributedTo(first: $pageSize, contributionTypes: [COMMIT, PULL_REQUEST, REPOSITORY], includeUserRepositories: false, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { nameWithOwner owner { login __typename } stargazers { totalCount } languages(first: 10, orderBy: {field: SIZE, direction: DESC}) @include(if: $fetchLangs) { edges { size node { color name } } } }
    }
  }
}
`;

const QUERY_PAGINATE_ORG_REPOS = `
query paginateOrg($login: String!, $cursor: String, $pageSize: Int!, $fetchLangs: Boolean!) {
  organization(login: $login) {
    repositories(first: $pageSize, isFork: false, orderBy: {direction: DESC, field: STARGAZERS}, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { nameWithOwner stargazers { totalCount } languages(first: 10, orderBy: {field: SIZE, direction: DESC}) @include(if: $fetchLangs) { edges { size node { color name } } } }
    }
  }
}
`;

async function postGraphQL<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  return githubClient.request<T>(query, {
    variables,
    timeoutMs: FETCH_TIMEOUT_MS,
  });
}

type LangMap = Map<string, { size: number; color: string }>;
type LangEdge = { size: number; node: { name: string; color: string | null } };

function accLangs(edges: LangEdge[] | null | undefined, map: LangMap): void {
  if (!edges?.length) return;
  for (const edge of edges) {
    if (!edge?.node?.name || !edge.size) continue;
    const existing = map.get(edge.node.name);
    if (existing) existing.size += edge.size;
    else map.set(edge.node.name, { size: edge.size, color: edge.node.color ?? "#ccc" });
  }
}

async function fetchAvatarAsBase64(url: string | null | undefined): Promise<string> {
  if (!url) return "";
  try {
    const target = new URL(url);
    target.searchParams.set("s", "150");
    const res = await fetch(target.toString(), {
      signal: AbortSignal.timeout(AVATAR_TIMEOUT_MS),
    });
    if (!res.ok) return url;
    const contentType = res.headers.get("content-type") || "image/png";
    if (!contentType.toLowerCase().startsWith("image/")) return url;
    const contentLength = Number(res.headers.get("content-length") || 0);
    if (contentLength > MAX_AVATAR_BYTES) return url;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_AVATAR_BYTES) return url;
    return `data:${contentType};base64,${Buffer.from(buf).toString("base64")}`;
  } catch {
    return url;
  }
}

type ContributionEntry = {
  repository?: { owner?: { login?: string; __typename?: string } | null } | null;
  contributions?: { totalCount?: number } | null;
};

function sumContributions(
  entries: ContributionEntry[] | null | undefined,
  orgsSet: Set<string> | null,
): number {
  if (!entries?.length) return 0;
  let total = 0;
  for (const entry of entries) {
    const owner = entry?.repository?.owner;
    if (owner?.__typename !== "Organization" || !owner?.login) continue;
    if (orgsSet && !orgsSet.has(owner.login.toLowerCase())) continue;
    total += entry?.contributions?.totalCount ?? 0;
  }
  return total;
}

async function directFetch(username: string, opts: FetchOptions): Promise<ProfileData> {
  const isPersonal = opts.scope !== "org";
  const isOrg = opts.scope === "org" || opts.scope === "all";
  const fetchLangs = opts.includeLanguages ?? true;
  const orgsArr = normalizeOrgFilters(opts.orgs);
  const orgsSet = orgsArr.length > 0 ? new Set(orgsArr) : null;
  const affiliations =
    opts.affiliations === "owner" ? ["OWNER"] : ["OWNER", "ORGANIZATION_MEMBER", "COLLABORATOR"];

  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
  const to = now.toISOString();

  let user: ProfileUser | OrgProfile | null = null;
  let isOrgAccount = false;
  try {
    const data = await postGraphQL<{ user: ProfileUser | null }>(QUERY_PROFILE, {
      login: username,
      from,
      to,
      isOrg,
    });
    user = data.user;
    if (!user) throw new NotFoundError();
  } catch (err) {
    if (err instanceof NotFoundError) {
      const data = await postGraphQL<{ organization: OrgProfile | null }>(QUERY_ORG, {
        login: username,
      });
      user = data.organization;
      if (!user) throw new NotFoundError();
      isOrgAccount = true;
    } else throw err;
  }

  const langMap: LangMap = new Map();
  const seenRepos = new Set<string>();
  let stars = 0;
  let reposCount = 0;

  const processNode = (node: RepoNode, scopeCheck: boolean): void => {
    if (!node?.nameWithOwner || seenRepos.has(node.nameWithOwner)) return;
    if (
      scopeCheck &&
      node.owner?.__typename === "Organization" &&
      orgsSet &&
      !orgsSet.has(node.owner.login.toLowerCase())
    )
      return;
    seenRepos.add(node.nameWithOwner);
    stars += node.stargazers?.totalCount ?? 0;
    reposCount++;
    if (fetchLangs) accLangs(node.languages?.edges ?? null, langMap);
  };

  type PaginateData = {
    user?: { repositories?: RepoConnection; repositoriesContributedTo?: RepoConnection } | null;
    organization?: { repositories: RepoConnection } | null;
  };

  const getConnection = (data: PaginateData, query: string): RepoConnection | undefined =>
    data.user
      ? query.includes("repositoriesContributedTo")
        ? (data.user.repositoriesContributedTo ?? undefined)
        : (data.user.repositories ?? undefined)
      : data.organization?.repositories;

  const traversePages = async (query: string, scopeCheck: boolean): Promise<void> => {
    let cursor: string | null = null;
    let page = 0;
    let hasNext = true;

    while (hasNext && page++ < MAX_PAGES) {
      const data = await postGraphQL<PaginateData>(query, {
        login: username,
        cursor,
        pageSize: REPO_PAGE_SIZE,
        fetchLangs,
        affiliations,
      });
      const nextConn = getConnection(data, query);
      for (const node of nextConn?.nodes ?? []) processNode(node, scopeCheck);
      hasNext = nextConn?.pageInfo?.hasNextPage ?? false;
      cursor = nextConn?.pageInfo?.endCursor ?? null;
      if (hasNext && !cursor) break;
    }
  };

  const tasks: Promise<void>[] = [];
  if (!isOrgAccount) {
    if (isPersonal) tasks.push(traversePages(QUERY_PAGINATE_USER_REPOS, false));
    if (isOrg) tasks.push(traversePages(QUERY_PAGINATE_ORG_CONTRIBS, true));
  } else {
    tasks.push(traversePages(QUERY_PAGINATE_ORG_REPOS, false));
  }

  const [avatarDataUrl] = await Promise.all([fetchAvatarAsBase64(user.avatarUrl), ...tasks]);

  let commits = 0;
  let prs = 0;
  let issues = 0;

  if (!isOrgAccount) {
    const profile = user as ProfileUser;
    const c = profile.contributionsCollection;
    if (opts.scope === "org") {
      commits = sumContributions(c?.commitContributionsByRepository, orgsSet);
      prs = sumContributions(c?.pullRequestContributionsByRepository, orgsSet);
      issues = sumContributions(c?.issueContributionsByRepository, orgsSet);
    } else {
      commits = c?.totalCommitContributions ?? 0;
      prs =
        (profile.openPRs?.totalCount ?? 0) +
        (profile.closedPRs?.totalCount ?? 0) +
        (profile.mergedPRs?.totalCount ?? 0);
      issues = (profile.openIssues?.totalCount ?? 0) + (profile.closedIssues?.totalCount ?? 0);
    }
  }

  const languages = Array.from(langMap.entries())
    .map(([name, { size, color }]) => ({ name, size, color }))
    .sort((a, b) => b.size - a.size)
    .slice(0, opts.langCount || 5);

  const profileUser = !isOrgAccount ? (user as ProfileUser) : null;
  const orgUser = isOrgAccount ? (user as OrgProfile) : null;

  return {
    user: {
      login: user!.login,
      name: user!.name,
      avatarUrl: avatarDataUrl,
      bio: isOrgAccount ? (orgUser?.description ?? null) : (profileUser?.bio ?? null),
      pronouns: isOrgAccount ? null : (profileUser?.pronouns ?? null),
      twitter: user!.twitterUsername ?? null,
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
  const orgs = normalizeOrgFilters(opts.orgs);
  const cacheKey = Bun.hash(
    `v${CACHE_VERSION}:${norm}:${opts.scope || "personal"}:${opts.affiliations || "owner"}:${opts.includeLanguages !== false}:${opts.langCount || 5}:${orgs.join("|")}`,
  ).toString(36);

  if (!opts.forceRefresh) {
    const mem = memCache.get(cacheKey);
    const now = Date.now();
    if (mem && mem.expiresAt > now) {
      if (mem.staleAt <= now && !refreshInFlight.has(cacheKey))
        triggerBackgroundRefresh(username, opts, cacheKey);
      return mem.data;
    }

    const cached = await readRedisCache(cacheKey, now);
    if (cached) {
      setMemoryCache(cacheKey, cached);
      if (cached.staleAt <= now && !refreshInFlight.has(cacheKey))
        triggerBackgroundRefresh(username, opts, cacheKey);
      return cached.data;
    }
  }

  if (inFlight.has(cacheKey)) return inFlight.get(cacheKey)!;

  const promise = directFetch(username, opts)
    .then((data) => saveProfileCache(cacheKey, data))
    .finally(() => {
      inFlight.delete(cacheKey);
    });

  inFlight.set(cacheKey, promise);
  return promise;
}

function triggerBackgroundRefresh(username: string, opts: FetchOptions, cacheKey: string) {
  if (refreshInFlight.has(cacheKey)) return;
  refreshInFlight.add(cacheKey);

  void directFetch(username, { ...opts, forceRefresh: true })
    .then((data) => saveProfileCache(cacheKey, data))
    .catch(() => {})
    .finally(() => {
      refreshInFlight.delete(cacheKey);
    });
}
