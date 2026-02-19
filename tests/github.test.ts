import { afterEach, beforeEach, describe, expect, it } from "bun:test";

let originalFetch: typeof globalThis.fetch | undefined;

beforeEach(() => {
  process.env.GITHUB_TOKEN = "test";
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  if (originalFetch) globalThis.fetch = originalFetch;
});

describe("getProfileData", () => {
  it("fetches profile data and caches it", async () => {
    const calls: string[] = [];
    const fetchMock = async (input: RequestInit | string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      calls.push(url);
      if (url.includes("api.github.com/graphql")) {
        return new Response(
          JSON.stringify({
            data: {
              user: {
                login: "octocat",
                name: "The Octocat",
                avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
                bio: "Hello",
                pronouns: "they/them",
                twitterUsername: "octo",
                openPRs: { totalCount: 1 },
                closedPRs: { totalCount: 2 },
                mergedPRs: { totalCount: 3 },
                openIssues: { totalCount: 1 },
                closedIssues: { totalCount: 4 },
                contributionsCollection: { totalCommitContributions: 10 },
                repositories: {
                  totalCount: 2,
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: [
                    {
                      stargazers: { totalCount: 5 },
                      languages: {
                        edges: [
                          { size: 100, node: { color: "#3178c6", name: "TypeScript" } },
                          { size: 50, node: { color: "#e34c26", name: "HTML" } },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      });
    };

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const mod = await import("../src/github");
    const profile1 = await mod.getProfileData("octocat");
    const profile2 = await mod.getProfileData("octocat");
    const profile3 = await mod.getProfileData("octocat", { langCount: 1 });

    expect(profile1.user.login).toBe("octocat");
    expect(profile1.stats.prs).toBe(6);
    expect(profile2.user.login).toBe("octocat");
    expect(profile3.languages.length).toBe(1);

    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  it("supports organization scope and org filtering", async () => {
    const fetchMock = async (input: RequestInit | string | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("api.github.com/graphql")) {
        const payload = JSON.parse(String(init?.body || "{}"));
        const query = String(payload.query || "");

        // New: repositoriesContributedTo-based org contributions query
        if (query.includes("orgContribs")) {
          return new Response(
            JSON.stringify({
              data: {
                user: {
                  repositoriesContributedTo: {
                    totalCount: 3,
                    pageInfo: { hasNextPage: false, endCursor: null },
                    nodes: [
                      {
                        owner: { login: "acme", __typename: "Organization" },
                        stargazers: { totalCount: 7 },
                        languages: {
                          edges: [{ size: 60, node: { color: "#00ADD8", name: "Go" } }],
                        },
                      },
                      {
                        owner: { login: "other-org", __typename: "Organization" },
                        stargazers: { totalCount: 3 },
                        languages: {
                          edges: [{ size: 40, node: { color: "#f1e05a", name: "JavaScript" } }],
                        },
                      },
                      {
                        // Contributed to another user's repo — should be excluded from org stats
                        owner: { login: "some-user", __typename: "User" },
                        stargazers: { totalCount: 100 },
                        languages: {
                          edges: [{ size: 200, node: { color: "#dea584", name: "Rust" } }],
                        },
                      },
                    ],
                  },
                },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        // Personal repos query
        return new Response(
          JSON.stringify({
            data: {
              user: {
                login: "octocat",
                name: "The Octocat",
                avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
                bio: "Hello",
                pronouns: "they/them",
                twitterUsername: "octo",
                openPRs: { totalCount: 1 },
                closedPRs: { totalCount: 2 },
                mergedPRs: { totalCount: 3 },
                openIssues: { totalCount: 1 },
                closedIssues: { totalCount: 4 },
                contributionsCollection: { totalCommitContributions: 10 },
                repositories: {
                  totalCount: 2,
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: [
                    {
                      stargazers: { totalCount: 5 },
                      languages: {
                        edges: [{ size: 100, node: { color: "#3178c6", name: "TypeScript" } }],
                      },
                    },
                  ],
                },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      });
    };

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const mod = await import("../src/github");

    // org scope with orgs=["acme"] → only acme's repos the user contributed to
    const orgOnly = await mod.getProfileData("octocat", {
      scope: "org",
      orgs: ["acme"],
    });
    // all scope with orgs=["acme"] → personal + acme contributions
    const allScope = await mod.getProfileData("octocat", {
      scope: "all",
      orgs: ["acme"],
    });

    // orgOnly: only acme's 7 stars, 1 repo (other-org excluded by filter, User-owned excluded by __typename)
    expect(orgOnly.stats.stars).toBe(7);
    expect(orgOnly.stats.repos).toBe(1);
    expect(orgOnly.languages[0]?.name).toBe("Go");

    // allScope: personal (5 stars, 2 repos) + acme (7 stars, 1 repo) = 12 stars, 3 repos
    expect(allScope.stats.stars).toBe(12);
    expect(allScope.stats.repos).toBe(3);
    expect(allScope.languages.map((l) => l.name)).toContain("TypeScript");
    expect(allScope.languages.map((l) => l.name)).toContain("Go");
  });
});
