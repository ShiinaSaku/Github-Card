import type { ProfileData, LanguageStat } from "@/types";
import { Redis } from "@upstash/redis";

const GITHUB_TOKEN = Bun.env.GITHUB_TOKEN;
if (!GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is missing");

const HEADERS = {
  Authorization: `bearer ${GITHUB_TOKEN}`,
  "Content-Type": "application/json",
  "User-Agent": "github-card",
};

const QUERY = `
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

const CACHE_TTL_SECONDS = 30 * 60;
const cache = new Map<
  string,
  { expiresAt: number; value?: ProfileData; inFlight?: Promise<ProfileData> }
>();

const redisUrl = Bun.env.UPSTASH_REDIS_REST_URL || Bun.env.KV_REST_API_URL || "";
const redisToken = Bun.env.UPSTASH_REDIS_REST_TOKEN || Bun.env.KV_REST_API_TOKEN || "";
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

function getCache(username: string): ProfileData | null {
  const entry = cache.get(username);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(username);
    return null;
  }
  return entry.value ?? null;
}

function setCache(username: string, value: ProfileData) {
  cache.set(username, { expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000, value });
}

export async function getProfileData(username: string): Promise<ProfileData> {
  const cached = getCache(username);
  if (cached) return cached;

  if (redis) {
    try {
      const redisValue = await redis.get<ProfileData>(`profile:${username}`);
      if (redisValue) {
        setCache(username, redisValue);
        return redisValue;
      }
    } catch {}
  }

  const existing = cache.get(username);
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
      const langMap = new Map<string, { size: number; color: string }>();

      while (hasNextPage) {
        const res = await fetch("https://api.github.com/graphql", {
          method: "POST",
          headers: HEADERS,
          body: JSON.stringify({ query: QUERY, variables: { login: username, cursor, from, to } }),
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`GitHub API error (${res.status}): ${text}`);
        }

        const body = (await res.json()) as any;
        if (body.errors || !body.data?.user) throw new Error("User not found");

        if (!user) user = body.data.user;

        const repos = body.data.user.repositories;
        const nodes = repos.nodes || [];

        for (const repo of nodes) {
          totalStars += repo.stargazers.totalCount;
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

        hasNextPage = repos.pageInfo.hasNextPage;
        cursor = repos.pageInfo.endCursor;
        if (nodes.length === 0) hasNextPage = false;
      }

      const languages: LanguageStat[] = Array.from(langMap.entries())
        .sort((a, b) => b[1].size - a[1].size)
        .slice(0, 5)
        .map(([name, d]) => ({ name, size: d.size, color: d.color }));

      const profile: ProfileData = {
        user: {
          login: user.login,
          name: user.name,
          avatarUrl: user.avatarUrl,
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

      setCache(username, profile);
      if (redis) {
        try {
          await redis.set(`profile:${username}`, profile, { ex: CACHE_TTL_SECONDS });
        } catch {}
      }
      return profile;
    } catch (err) {
      cache.delete(username);
      throw err;
    }
  })();

  cache.set(username, { expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000, inFlight });
  return inFlight;
}
