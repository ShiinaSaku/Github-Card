import type { ProfileData, LanguageStat } from "@/types";

const GITHUB_TOKEN = Bun.env.GITHUB_TOKEN;
if (!GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is missing");

const HEADERS = {
  Authorization: `bearer ${GITHUB_TOKEN}`,
  "Content-Type": "application/json",
  "User-Agent": "bun-github-stats",
};

const QUERY = `
query userInfo($login: String!, $cursor: String) {
  user(login: $login) {
    login
    name
    avatarUrl
    bio
    pronouns
    twitterUsername
    repositoriesContributedTo(first: 1, contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, REPOSITORY]) { totalCount }
    openPRs: pullRequests(states: OPEN) { totalCount }
    closedPRs: pullRequests(states: CLOSED) { totalCount }
    mergedPRs: pullRequests(states: MERGED) { totalCount }
    openIssues: issues(states: OPEN) { totalCount }
    closedIssues: issues(states: CLOSED) { totalCount }
    repositories(first: 100, ownerAffiliations: OWNER, orderBy: {direction: DESC, field: STARGAZERS}, after: $cursor) {
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

async function fetchCommits(username: string): Promise<number> {
  try {
    const res = await fetch(
      `https://api.github.com/search/commits?q=author:${username}&per_page=1`,
      {
        headers: { ...HEADERS, Accept: "application/vnd.github.v3+json" },
      },
    );
    if (!res.ok) return 0;
    const data = (await res.json()) as { total_count?: number };
    return data.total_count ?? 0;
  } catch {
    return 0;
  }
}

export async function getProfileData(username: string): Promise<ProfileData> {
  const commitPromise = fetchCommits(username);
  let hasNextPage = true;
  let cursor: string | null = null;
  let user: any = null;
  let totalStars = 0;
  const langMap = new Map<string, { size: number; color: string }>();

  while (hasNextPage) {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ query: QUERY, variables: { login: username, cursor } }),
    });

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

  return {
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
      commits: await commitPromise,
    },
    languages,
  };
}
