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
    globalThis.fetch = (async (input: any, _init: any) => {
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
    const profile1 = await mod.getProfileData("github-test-cache", { forceRefresh: true });
    const callsAfterFirstFetch = calls.length;
    const profile2 = await mod.getProfileData("github-test-cache");
    expect(calls.length).toBe(callsAfterFirstFetch);
    const profile3 = await mod.getProfileData("octocat", { langCount: 1, forceRefresh: true });

    expect(profile1.user.login).toBe("octocat");
    expect(profile1.stats.prs).toBe(6);
    expect(profile2.user.login).toBe("octocat");
    expect(profile3.languages.length).toBe(1);
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  it("supports organization scope and org filtering", async () => {
    globalThis.fetch = (async (_input: any, _init: any) => {
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
                    nameWithOwner: "acme/user-owned",
                    owner: { login: "acme", __typename: "User" },
                    stargazers: { totalCount: 100 },
                    languages: { edges: [{ size: 200, node: { color: "#dea584", name: "Rust" } }] },
                  },
                  {
                    nameWithOwner: "unknown/missing-owner",
                    stargazers: { totalCount: 200 },
                    languages: { edges: [{ size: 300, node: { color: "#dea584", name: "Rust" } }] },
                  },
                  {
                    nameWithOwner: "unknown/null-owner",
                    owner: null,
                    stargazers: { totalCount: 300 },
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
      orgs: [" ACME ", "acme", ""],
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
    expect(allScope.languages.map((l) => l.name)).not.toContain("Rust");

    const unfiltered = await mod.getProfileData("octocat", { scope: "org", forceRefresh: true });
    expect(unfiltered.stats.repos).toBe(2);
    expect(unfiltered.stats.stars).toBe(10);
    expect(unfiltered.languages.map((l) => l.name)).not.toContain("Rust");
  });

  it("supports owner-only or affiliated repository modes", async () => {
    const queries: string[] = [];
    globalThis.fetch = (async (_input: any, init: any) => {
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
    await mod.getProfileData("octocat", { affiliations: "affiliated", forceRefresh: true });
    await mod.getProfileData("octocat", { affiliations: "owner", forceRefresh: true });
    await mod.getProfileData("octocat", { forceRefresh: true });

    const repoVariables = queries.map((q) => JSON.parse(q)).filter((q) => q.affiliations);
    expect(repoVariables.map((q) => q.affiliations)).toEqual([
      ["OWNER", "ORGANIZATION_MEMBER", "COLLABORATOR"],
      ["OWNER"],
      ["OWNER"],
    ]);
  });

  it("keeps repository connections out of the initial profile request", async () => {
    const payloads: any[] = [];
    globalThis.fetch = (async (input: any, init: any) => {
      if (!String(input).includes("graphql")) {
        return new Response(new Uint8Array([1]), { headers: { "content-type": "image/png" } });
      }

      const payload = JSON.parse(String(init?.body || "{}"));
      payloads.push(payload);

      if (payload.query.includes("fullProfile")) {
        return new Response(
          JSON.stringify({
            data: {
              user: {
                ...mockBaseUser,
                contributionsCollection: { totalCommitContributions: 10 },
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          data: {
            user: {
              repositories: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [{ nameWithOwner: "octocat/hello-world", stargazers: { totalCount: 5 } }],
              },
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as any;

    const mod = await import("../src/github");
    const profile = await mod.getProfileData("octocat", { forceRefresh: true });

    const fullProfile = payloads.find((payload) => payload.query.includes("fullProfile"));
    const paginateRepos = payloads.find((payload) => payload.query.includes("paginateRepos"));

    expect(profile.stats.repos).toBe(1);
    expect(fullProfile.query).not.toContain("repositories(");
    expect(fullProfile.query).not.toContain("repositoriesContributedTo(");
    expect(fullProfile.query).toContain("closedPRs: pullRequests(states: CLOSED)");
    expect(fullProfile.query).toContain("mergedPRs: pullRequests(states: MERGED)");
    expect(paginateRepos.variables.pageSize).toBe(100);
    expect(paginateRepos.variables.cursor).toBeNull();
  });

  it("does not mutate organization filters while building cache keys", async () => {
    globalThis.fetch = (async (_input: any, init: any) => {
      const payload = JSON.parse(String(init?.body || "{}"));
      if (payload.query.includes("fullProfile")) {
        return new Response(
          JSON.stringify({
            data: {
              user: {
                ...mockBaseUser,
                contributionsCollection: { totalCommitContributions: 10 },
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (payload.query.includes("paginateOrgContribs")) {
        return new Response(
          JSON.stringify({
            data: {
              user: {
                repositoriesContributedTo: {
                  pageInfo: { hasNextPage: false },
                  nodes: [
                    {
                      nameWithOwner: "zeta/app",
                      owner: { login: "zeta", __typename: "Organization" },
                      stargazers: { totalCount: 1 },
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
    const orgs = ["zeta", "alpha"];
    await mod.getProfileData("octocat", { scope: "org", orgs, forceRefresh: true });

    expect(orgs).toEqual(["zeta", "alpha"]);
  });

  it("normalizes the first fetch and shares cache entries for equivalent options", async () => {
    const payloads: any[] = [];
    globalThis.fetch = (async (_input: any, init: any) => {
      const payload = JSON.parse(String(init?.body || "{}"));
      payloads.push(payload);
      return Response.json({
        data: {
          user: {
            ...mockBaseUser,
            login: payload.variables.login,
            avatarUrl: "",
            contributionsCollection: { totalCommitContributions: 10 },
            repositories: { pageInfo: { hasNextPage: false }, nodes: [] },
          },
        },
      });
    }) as any;

    const { getProfileData } = await import("../src/github");
    const orgs = [" Zeta ", "ALPHA", "zeta", ""];
    const first = await getProfileData("  GitHub-Test-Normalized  ", { orgs, forceRefresh: true });
    const second = await getProfileData("github-test-normalized", {
      scope: "personal",
      affiliations: "owner",
      includeLanguages: true,
      langCount: 5,
      orgs: ["alpha", "zeta"],
    });
    expect(first.user.login).toBe("github-test-normalized");
    expect(second).toEqual(first);
    expect(payloads).toHaveLength(2);
    expect(payloads.every((p) => p.variables.login === "github-test-normalized")).toBe(true);
    expect(payloads[1].variables.affiliations).toEqual(["OWNER"]);
    expect(orgs).toEqual([" Zeta ", "ALPHA", "zeta", ""]);
  });

  it("includes a sixth repository page and totals more than 500 repositories", async () => {
    const cursors: Array<string | null> = [];
    globalThis.fetch = (async (_input: any, init: any) => {
      const payload = JSON.parse(String(init?.body || "{}"));
      if (payload.query.includes("fullProfile")) {
        return Response.json({ data: { user: { ...mockBaseUser, avatarUrl: "" } } });
      }
      cursors.push(payload.variables.cursor);
      const page = cursors.length;
      return Response.json({
        data: {
          user: {
            repositories: {
              pageInfo: { hasNextPage: page < 6, endCursor: `page-${page}` },
              nodes: Array.from({ length: page < 6 ? 100 : 1 }, (_, i) => ({
                nameWithOwner: `pagination/repo-${page}-${i}`,
                stargazers: { totalCount: 2 },
                languages: { edges: [{ size: 10, node: { name: "Go", color: "#00ADD8" } }] },
              })),
            },
          },
        },
      });
    }) as any;

    const { getProfileData } = await import("../src/github");
    const profile = await getProfileData("github-test-six-pages", { forceRefresh: true });
    expect(cursors).toEqual([null, "page-1", "page-2", "page-3", "page-4", "page-5"]);
    expect(profile.stats.repos).toBe(501);
    expect(profile.stats.stars).toBe(1002);
    expect(profile.languages).toEqual([{ name: "Go", size: 5010, color: "#00ADD8" }]);
  });

  it.each([
    "missing cursor",
    "empty cursor",
    "repeated cursor",
    "cycling cursor",
    "missing connection",
    "missing pageInfo",
    "missing nodes",
    "page cap",
  ])("rejects %s without caching incomplete totals", async (scenario) => {
    let pages = 0;
    let repaired = false;
    globalThis.fetch = (async (_input: any, init: any) => {
      const payload = JSON.parse(String(init?.body || "{}"));
      if (payload.query.includes("fullProfile")) {
        return Response.json({ data: { user: { ...mockBaseUser, avatarUrl: "" } } });
      }
      pages++;
      const connection: any = {
        pageInfo: { hasNextPage: !repaired, endCursor: `page-${pages}` },
        nodes: [{ nameWithOwner: `pagination/repo-${pages}`, stargazers: { totalCount: 3 } }],
      };
      if (!repaired) {
        if (scenario === "missing cursor") connection.pageInfo.endCursor = null;
        if (scenario === "empty cursor") connection.pageInfo.endCursor = " ";
        if (scenario === "repeated cursor") connection.pageInfo.endCursor = "same";
        if (scenario === "cycling cursor") connection.pageInfo.endCursor = `cycle-${pages % 2}`;
        if (scenario === "missing pageInfo") delete connection.pageInfo;
        if (scenario === "missing nodes") delete connection.nodes;
      }
      return Response.json({
        data: {
          user: scenario === "missing connection" && !repaired ? {} : { repositories: connection },
        },
      });
    }) as any;

    const { getProfileData, UpstreamError } = await import("../src/github");
    const username = `github-test-pagination-${scenario.replaceAll(" ", "-")}`;
    const request = getProfileData(username, { forceRefresh: true });
    await expect(request).rejects.toBeInstanceOf(UpstreamError);
    const message =
      scenario === "page cap"
        ? "exceeded 100 pages"
        : scenario.includes("cursor")
          ? "cursor is missing or invalid"
          : "connection is missing or invalid";
    await expect(request).rejects.toThrow(message);
    const expectedPages =
      scenario === "page cap"
        ? 100
        : scenario === "repeated cursor"
          ? 2
          : scenario === "cycling cursor"
            ? 3
            : 1;
    expect(pages).toBe(expectedPages);

    repaired = true;
    const failedPages = pages;
    const profile = await getProfileData(username);
    expect(pages).toBe(failedPages + 1);
    expect(profile.stats.repos).toBe(1);
    expect(profile.stats.stars).toBe(3);
  });

  it("includes issue contributions but excludes forks from organization repository totals", async () => {
    const queries: string[] = [];
    globalThis.fetch = (async (_input: Request | string | URL, init?: RequestInit) => {
      const query = String(JSON.parse(String(init?.body || "{}")).query || "");
      queries.push(query);
      const owner = { login: "acme", __typename: "Organization" };
      const user = query.includes("fullProfile")
        ? {
            ...mockBaseUser,
            avatarUrl: "",
            contributionsCollection: {
              totalCommitContributions: 0,
              issueContributionsByRepository: [
                { repository: { owner }, contributions: { totalCount: 2 } },
              ],
            },
          }
        : {
            repositoriesContributedTo: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [
                {
                  nameWithOwner: "acme/issue-only",
                  isFork: false,
                  owner,
                  stargazers: { totalCount: 3 },
                },
                {
                  nameWithOwner: "acme/fork",
                  isFork: true,
                  owner,
                  stargazers: { totalCount: 100 },
                },
              ],
            },
          };
      return Response.json({ data: { user } });
    }) as typeof fetch;
    const { getProfileData } = await import("../src/github");
    const profile = await getProfileData("issue-contributor", { scope: "org", forceRefresh: true });
    expect(profile.stats.stars).toBe(3);
    expect(profile.stats.repos).toBe(1);
    expect(profile.stats.issues).toBe(2);
    const query = queries.find((value) => value.includes("paginateOrgContribs"));
    expect(query).toContain("COMMIT, ISSUE, PULL_REQUEST, REPOSITORY");
    expect(query).toContain("isFork");
  });

  it("applies language filters before the limit and keeps filtered caches separate", async () => {
    let requests = 0;
    globalThis.fetch = (async (_input: Request | string | URL, init?: RequestInit) => {
      requests++;
      const query = String(JSON.parse(String(init?.body || "{}")).query || "");
      const user = query.includes("fullProfile")
        ? {
            ...mockBaseUser,
            avatarUrl: "",
            contributionsCollection: { totalCommitContributions: 0 },
          }
        : {
            repositories: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [
                {
                  nameWithOwner: "filtered-languages/repo",
                  stargazers: { totalCount: 0 },
                  languages: {
                    edges: [
                      { size: 500, node: { name: "TypeScript", color: "#3178c6" } },
                      { size: 300, node: { name: "HTML", color: "#e34c26" } },
                      { size: 100, node: { name: "Rust", color: "#dea584" } },
                    ],
                  },
                },
              ],
            },
          };
      return Response.json({ data: { user } });
    }) as typeof fetch;
    const { getProfileData } = await import("../src/github");
    const unfiltered = await getProfileData("filtered-languages", { langCount: 1 });
    const hidden = await getProfileData("filtered-languages", {
      langCount: 1,
      hideLangs: ["typescript"],
    });
    const shown = await getProfileData("filtered-languages", { langCount: 1, showLangs: ["rust"] });
    const beforeCache = requests;
    const cached = await getProfileData("filtered-languages", {
      langCount: 1,
      showLangs: [" RUST ", "rust"],
    });
    expect(unfiltered.languages.map(({ name }) => name)).toEqual(["TypeScript"]);
    expect(hidden.languages.map(({ name }) => name)).toEqual(["HTML"]);
    expect(shown.languages.map(({ name }) => name)).toEqual(["Rust"]);
    expect(cached).toEqual(shown);
    expect(requests).toBe(beforeCache);
    expect(hidden.stats).toEqual(unfiltered.stats);
  });

  it("keeps remote avatar URLs when the avatar response is not an image", async () => {
    globalThis.fetch = (async (input: any, _init: any) => {
      if (String(input).includes("graphql")) {
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
      }
      return new Response("<html></html>", { headers: { "content-type": "text/html" } });
    }) as any;

    const mod = await import("../src/github");
    const profile = await mod.getProfileData("octocat", { forceRefresh: true });

    expect(profile.user.avatarUrl).toBe(mockBaseUser.avatarUrl);
  });

  it("supports organization profile cards via the same API", async () => {
    globalThis.fetch = (async (_input: any, init: any) => {
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
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (payload.query.includes("paginateOrg")) {
        return new Response(
          JSON.stringify({
            data: {
              organization: {
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
    expect(profile.stats.commits).toBeNull();
    expect(profile.stats.prs).toBeNull();
    expect(profile.stats.issues).toBeNull();
  });

  it("falls back to organization queries when user lookup is not found", async () => {
    globalThis.fetch = (async (_input: any, init: any) => {
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
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (payload.query.includes("paginateOrg")) {
        return new Response(
          JSON.stringify({
            data: {
              organization: {
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
