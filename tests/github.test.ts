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
  const mockBaseUser = {
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
  };

  it("fetches profile data and caches it", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input: any, init: any) => {
      calls.push(input.toString());
      if (input.toString().includes("graphql")) {
        return new Response(
          JSON.stringify({
            data: {
              user: {
                ...mockBaseUser,
                contributionsCollection: { totalCommitContributions: 10 },
                repositories: {
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
      return new Response(new Uint8Array([1, 2]), { headers: { "Content-Type": "image/png" } });
    }) as any;

    const mod = await import("../src/github");
    const profile1 = await mod.getProfileData("octocat");
    const profile2 = await mod.getProfileData("octocat");
    const profile3 = await mod.getProfileData("octocat", { langCount: 1, forceRefresh: true });

    expect(profile1.user.login).toBe("octocat");
    expect(profile1.stats.prs).toBe(6);
    expect(profile2.user.login).toBe("octocat");
    expect(profile3.languages.length).toBe(1);
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  it("supports organization scope and org filtering", async () => {
    globalThis.fetch = (async (input: any, init: any) => {
      return new Response(
        JSON.stringify({
          data: {
            user: {
              ...mockBaseUser,
              contributionsCollection: {
                totalCommitContributions: 10,
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
              repositories: {
                pageInfo: { hasNextPage: false },
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
              repositoriesContributedTo: {
                pageInfo: { hasNextPage: false },
                nodes: [
                  {
                    nameWithOwner: "acme/platform",
                    owner: { login: "acme", __typename: "Organization" },
                    stargazers: { totalCount: 7 },
                    languages: { edges: [{ size: 60, node: { color: "#00ADD8", name: "Go" } }] },
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
                    owner: { login: "some-user", __typename: "User" },
                    stargazers: { totalCount: 100 },
                    languages: { edges: [{ size: 200, node: { color: "#dea584", name: "Rust" } }] },
                  },
                ],
              },
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as any;

    const mod = await import("../src/github");
    const orgOnly = await mod.getProfileData("octocat", {
      scope: "org",
      orgs: ["acme"],
      forceRefresh: true,
    });
    const allScope = await mod.getProfileData("octocat", {
      scope: "all",
      orgs: ["acme"],
      forceRefresh: true,
    });

    expect(orgOnly.stats.stars).toBe(7);
    expect(orgOnly.stats.repos).toBe(1);
    expect(orgOnly.stats.commits).toBe(11);
    expect(orgOnly.stats.prs).toBe(5);
    expect(orgOnly.stats.issues).toBe(3);
    expect(orgOnly.languages[0]?.name).toBe("Go");

    expect(allScope.stats.stars).toBe(12);
    expect(allScope.stats.repos).toBe(2);
    expect(allScope.languages.map((l) => l.name)).toContain("TypeScript");
    expect(allScope.languages.map((l) => l.name)).toContain("Go");
  });

  it("supports owner-only or affiliated repository modes", async () => {
    const queries: string[] = [];
    globalThis.fetch = (async (input: any, init: any) => {
      const payload = JSON.parse(String(init?.body || "{}"));
      if (payload.variables) queries.push(JSON.stringify(payload.variables));

      return new Response(
        JSON.stringify({
          data: {
            user: {
              ...mockBaseUser,
              contributionsCollection: { totalCommitContributions: 10 },
              repositories: {
                pageInfo: { hasNextPage: false },
                nodes: [{ nameWithOwner: "octocat/hello-world", stargazers: { totalCount: 5 } }],
              },
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as any;

    const mod = await import("../src/github");
    await mod.getProfileData("octocat", { forceRefresh: true });
    await mod.getProfileData("octocat", { affiliations: "owner", forceRefresh: true });

    expect(queries.some((q) => q.includes("OWNER") && q.includes("ORGANIZATION_MEMBER"))).toBe(
      true,
    );
    expect(queries.some((q) => !q.includes("ORGANIZATION_MEMBER"))).toBe(true);
  });

  it("supports organization profile cards via the same API", async () => {
    globalThis.fetch = (async (input: any, init: any) => {
      const payload = JSON.parse(String(init?.body || "{}"));
      if (payload.query.includes("fullProfile")) {
        return new Response(
          JSON.stringify({ errors: [{ message: "Could not resolve to a User" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (payload.query.includes("fullOrg")) {
        return new Response(
          JSON.stringify({
            data: {
              organization: {
                login: "acme",
                name: "Acme Inc",
                avatarUrl: "https://avatars",
                description: "Org profile",
                twitterUsername: "acme",
                repositories: {
                  pageInfo: { hasNextPage: false },
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
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(new Uint8Array([1]), { headers: { "content-type": "image/png" } });
    }) as any;

    const mod = await import("../src/github");
    const profile = await mod.getProfileData("acme", { forceRefresh: true });

    expect(profile.user.login).toBe("acme");
    expect(profile.stats.stars).toBe(13);
    expect(profile.stats.repos).toBe(2);
    expect(profile.stats.commits).toBe(0);
  });

  it("falls back to organization queries when user lookup is not found", async () => {
    globalThis.fetch = (async (input: any, init: any) => {
      const payload = JSON.parse(String(init?.body || "{}"));
      if (payload.query.includes("fullProfile")) {
        return new Response(
          JSON.stringify({ errors: [{ message: "Could not resolve to a User" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (payload.query.includes("fullOrg")) {
        return new Response(
          JSON.stringify({
            data: {
              organization: {
                login: "acme",
                name: "Acme Inc",
                avatarUrl: "https://avatars",
                description: "Org profile",
                twitterUsername: "acme",
                repositories: {
                  pageInfo: { hasNextPage: false },
                  nodes: [{ nameWithOwner: "acme/core", stargazers: { totalCount: 9 } }],
                },
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(new Uint8Array([1]), { headers: { "content-type": "image/png" } });
    }) as any;

    const mod = await import("../src/github");
    const profile = await mod.getProfileData("acme", { forceRefresh: true });
    expect(profile.user.login).toBe("acme");
    expect(profile.stats.stars).toBe(9);
  });
});
