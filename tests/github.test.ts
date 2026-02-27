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
                      nameWithOwner: "octocat/hello-world",
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
                        nameWithOwner: "acme/platform",
                        owner: { login: "acme", __typename: "Organization" },
                        stargazers: { totalCount: 7 },
                        languages: {
                          edges: [{ size: 60, node: { color: "#00ADD8", name: "Go" } }],
                        },
                      },
                      {
                        nameWithOwner: "other-org/sdk",
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

        if (query.includes("orgScopedContribs")) {
          return new Response(
            JSON.stringify({
              data: {
                user: {
                  contributionsCollection: {
                    commitContributionsByRepository: [
                      {
                        repository: { owner: { login: "acme", __typename: "Organization" } },
                        contributions: { totalCount: 11 },
                      },
                      {
                        repository: { owner: { login: "other-org", __typename: "Organization" } },
                        contributions: { totalCount: 7 },
                      },
                    ],
                    pullRequestContributionsByRepository: [
                      {
                        repository: { owner: { login: "acme", __typename: "Organization" } },
                        contributions: { totalCount: 5 },
                      },
                    ],
                    issueContributionsByRepository: [
                      {
                        repository: { owner: { login: "acme", __typename: "Organization" } },
                        contributions: { totalCount: 3 },
                      },
                      {
                        repository: { owner: { login: "some-user", __typename: "User" } },
                        contributions: { totalCount: 100 },
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
                      nameWithOwner: "octocat/hello-world",
                      stargazers: { totalCount: 5 },
                      languages: {
                        edges: [{ size: 100, node: { color: "#3178c6", name: "TypeScript" } }],
                      },
                    },
                    {
                      nameWithOwner: "octocat/tools",
                      stargazers: { totalCount: 2 },
                      languages: {
                        edges: [{ size: 70, node: { color: "#00ADD8", name: "Go" } }],
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
    expect(orgOnly.stats.commits).toBe(11);
    expect(orgOnly.stats.prs).toBe(5);
    expect(orgOnly.stats.issues).toBe(3);
    expect(orgOnly.languages[0]?.name).toBe("Go");

    // allScope: personal (7 stars, 2 repos) + acme (7 stars, 1 repo) = 14 stars, 3 repos
    expect(allScope.stats.stars).toBe(14);
    expect(allScope.stats.repos).toBe(3);
    expect(allScope.languages.map((l) => l.name)).toContain("TypeScript");
    expect(allScope.languages.map((l) => l.name)).toContain("Go");
  });

  it("supports owner-only or affiliated repository modes", async () => {
    const queries: string[] = [];

    globalThis.fetch = (async (_input: RequestInit | string | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body || "{}"));
      const query = String(payload.query || "");
      queries.push(query);

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
                totalCount: 1,
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [
                  {
                    nameWithOwner: "octocat/hello-world",
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
    }) as unknown as typeof fetch;

    const mod = await import("../src/github");
    await mod.getProfileData("octocat", { forceRefresh: true });
    await mod.getProfileData("octocat", { affiliations: "owner", forceRefresh: true });

    expect(
      queries.some((query) =>
        query.includes("ownerAffiliations: [OWNER, ORGANIZATION_MEMBER, COLLABORATOR]"),
      ),
    ).toBe(true);
    expect(queries.some((query) => query.includes("ownerAffiliations: [OWNER]"))).toBe(true);
  });

  it("supports organization profile cards via the same API", async () => {
    globalThis.fetch = (async (_input: RequestInit | string | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body || "{}"));
      const query = String(payload.query || "");

      if (query.includes("userInfo")) {
        return new Response(
          JSON.stringify({
            errors: [{ message: "Could not resolve to a User with the login of 'acme'." }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (query.includes("orgInfo")) {
        return new Response(
          JSON.stringify({
            data: {
              organization: {
                login: "acme",
                name: "Acme Inc",
                avatarUrl: "https://avatars.githubusercontent.com/u/2?v=4",
                description: "Org profile",
                twitterUsername: "acme",
                repositories: {
                  totalCount: 2,
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: [
                    {
                      nameWithOwner: "acme/core",
                      stargazers: { totalCount: 9 },
                      languages: {
                        edges: [{ size: 80, node: { color: "#3178c6", name: "TypeScript" } }],
                      },
                    },
                    {
                      nameWithOwner: "acme/site",
                      stargazers: { totalCount: 4 },
                      languages: {
                        edges: [{ size: 40, node: { color: "#f1e05a", name: "JavaScript" } }],
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
    }) as unknown as typeof fetch;

    const mod = await import("../src/github");
    const profile = await mod.getProfileData("acme", { forceRefresh: true });

    expect(profile.user.login).toBe("acme");
    expect(profile.user.twitter).toBe("acme");
    expect(profile.stats.stars).toBe(13);
    expect(profile.stats.repos).toBe(2);
    expect(profile.stats.commits).toBe(0);
    expect(profile.stats.prs).toBe(0);
    expect(profile.stats.issues).toBe(0);
    expect(profile.languages.map((l) => l.name)).toContain("TypeScript");
  });

  it("falls back to organization queries when user lookup is not found", async () => {
    globalThis.fetch = (async (_input: RequestInit | string | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body || "{}"));
      const query = String(payload.query || "");

      if (query.includes("userInfo")) {
        return new Response(
          JSON.stringify({
            errors: [{ message: "Could not resolve to a User with the login of 'acme'." }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (query.includes("orgInfo")) {
        return new Response(
          JSON.stringify({
            data: {
              organization: {
                login: "acme",
                name: "Acme Inc",
                avatarUrl: "https://avatars.githubusercontent.com/u/2?v=4",
                description: "Org profile",
                twitterUsername: "acme",
                repositories: {
                  totalCount: 1,
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: [
                    {
                      nameWithOwner: "acme/core",
                      stargazers: { totalCount: 9 },
                      languages: {
                        edges: [{ size: 80, node: { color: "#3178c6", name: "TypeScript" } }],
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
    }) as unknown as typeof fetch;

    const mod = await import("../src/github");
    const profile = await mod.getProfileData("acme", { forceRefresh: true });
    expect(profile.user.login).toBe("acme");
    expect(profile.stats.stars).toBe(9);
  });
});
