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

    expect(profile1.user.login).toBe("octocat");
    expect(profile1.user.avatarDataUrl?.startsWith("data:image/png;base64,")).toBe(true);
    expect(profile1.stats.prs).toBe(6);
    expect(profile2.user.login).toBe("octocat");

    expect(calls.length).toBe(2);
  });
});
