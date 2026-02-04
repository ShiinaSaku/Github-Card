import type { ProfileData, LanguageStat } from "./types";
import { Buffer } from "buffer";

function getHeaders() {
  const token = Bun.env.GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is missing");
  return {
    Authorization: `bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "github-card",
  };
}

const QUERY_WITH_LANGS = `
query userInfo($login: String!, $cursor: String, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    login
    name
    avatarUrl
    bio
    pronouns
    twitterUsername
    openPRs: pullRequests(states: OPEN) { totalCount }
    closedPRs: pullRequests(states: CLOSED) { totalCount }
    mergedPRs: pullRequests(states: MERGED) { totalCount }
    openIssues: issues(states: OPEN) { totalCount }
    closedIssues: issues(states: CLOSED) { totalCount }
    contributionsCollection(from: $from, to: $to) {
      totalCommitContributions
    }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false, orderBy: {direction: DESC, field: STARGAZERS}, after: $cursor) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        stargazers { totalCount }
        languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
          edges { size node { color name } }
        }
      }
    }
  }
}`;

const QUERY_NO_LANGS = `
query userInfo($login: String!, $cursor: String, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    login
    name
    avatarUrl
    bio
    pronouns
    twitterUsername
    openPRs: pullRequests(states: OPEN) { totalCount }
    closedPRs: pullRequests(states: CLOSED) { totalCount }
    mergedPRs: pullRequests(states: MERGED) { totalCount }
    openIssues: issues(states: OPEN) { totalCount }
    closedIssues: issues(states: CLOSED) { totalCount }
    contributionsCollection(from: $from, to: $to) {
      totalCommitContributions
    }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false, orderBy: {direction: DESC, field: STARGAZERS}, after: $cursor) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        stargazers { totalCount }
      }
    }
  }
}`;

const CACHE_TTL_SECONDS = 30 * 60;
const cache = new Map<
  string,
  { expiresAt: number; value?: ProfileData; inFlight?: Promise<ProfileData> }
>();

type FetchOptions = {
  includeLanguages?: boolean;
};

const redisUrl = Bun.env.UPSTASH_REDIS_REST_URL || Bun.env.KV_REST_API_URL || "";
const redisToken = Bun.env.UPSTASH_REDIS_REST_TOKEN || Bun.env.KV_REST_API_TOKEN || "";
let redisPromise: Promise<import("@upstash/redis").Redis | null> | null = null;

async function getRedis() {
  if (!redisUrl || !redisToken) return null;
  if (!redisPromise) {
    redisPromise = import("@upstash/redis")
      .then((mod) => new mod.Redis({ url: redisUrl, token: redisToken }))
      .catch(() => null);
  }
  return redisPromise;
}

async function fetchAvatarDataUrl(url: string): Promise<string | null> {
  try {
    const sizedUrl = `${url}${url.includes("?") ? "&" : "?"}s=96`;
    const res = await fetch(sizedUrl, { headers: { "User-Agent": "github-card" } });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/png";
    const bytes = await res.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  }
}

function getCache(cacheKey: string): ProfileData | null {
  const entry = cache.get(cacheKey);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(cacheKey);
    return null;
  }
  return entry.value ?? null;
}

function setCache(cacheKey: string, value: ProfileData) {
  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000, value });
}

export async function getProfileData(
  username: string,
  opts: FetchOptions = {},
): Promise<ProfileData> {
  const includeLanguages = opts.includeLanguages ?? true;
  const cacheKey = `${username}:${includeLanguages ? "langs" : "nolangs"}`;

  const cached = getCache(cacheKey);
  if (cached) return cached;

  const redis = await getRedis();
  if (redis) {
    try {
      const redisValue = await redis.get<ProfileData>(`profile:${cacheKey}`);
      if (redisValue) {
        setCache(cacheKey, redisValue);
        return redisValue;
      }
    } catch {}
  }

  const existing = cache.get(cacheKey);
  if (existing?.inFlight) return existing.inFlight;

  const inFlight = (async () => {
    try {
      const now = new Date();
      const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0));
      const from = yearStart.toISOString();
      const to = now.toISOString();

      let hasNextPage = true;
      let cursor: string | null = null;
      let user: any = null;
      let totalStars = 0;
      const langMap = includeLanguages ? new Map<string, { size: number; color: string }>() : null;

      while (hasNextPage) {
        const res = await fetch("https://api.github.com/graphql", {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({
            query: includeLanguages ? QUERY_WITH_LANGS : QUERY_NO_LANGS,
            variables: { login: username, cursor, from, to },
          }),
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`GitHub API error (${res.status}): ${text}`);
        }

        const body = (await res.json()) as any;
        if (body.errors?.length) {
          const msg =
            body.errors.map((e: any) => e.message).filter(Boolean).join(" | ") ||
            "GitHub API error";
          throw new Error(msg);
        }
        if (!body.data?.user) throw new Error("User not found");

        if (!user) user = body.data.user;

        const repos = body.data.user.repositories;
        const nodes = repos.nodes || [];

        for (const repo of nodes) {
          totalStars += repo.stargazers.totalCount;
          if (langMap) {
            const edges = repo.languages?.edges || [];
            for (const edge of edges) {
              if (!edge.node || !edge.size) continue;
              const current = langMap.get(edge.node.name);
              if (current) {
                current.size += edge.size;
              } else {
                langMap.set(edge.node.name, { size: edge.size, color: edge.node.color || "#ccc" });
              }
            }
          }
        }

        hasNextPage = repos.pageInfo.hasNextPage;
        cursor = repos.pageInfo.endCursor;
        if (nodes.length === 0) hasNextPage = false;
      }

      const languages: LanguageStat[] = langMap
        ? Array.from(langMap.entries())
            .sort((a, b) => b[1].size - a[1].size)
            .slice(0, 5)
            .map(([name, d]) => ({ name, size: d.size, color: d.color }))
        : [];

      const avatarDataUrl = await fetchAvatarDataUrl(user.avatarUrl);
      const profile: ProfileData = {
        user: {
          login: user.login,
          name: user.name,
          avatarUrl: user.avatarUrl,
          avatarDataUrl,
          bio: user.bio,
          pronouns: user.pronouns,
          twitter: user.twitterUsername,
        },
        stats: {
          stars: totalStars,
          repos: user.repositories.totalCount,
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
          await redis.set(`profile:${cacheKey}`, profile, { ex: CACHE_TTL_SECONDS });
        } catch {}
      }
      return profile;
    } catch (err) {
      cache.delete(cacheKey);
      throw err;
    }
  })();

  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000, inFlight });
  return inFlight;
}
