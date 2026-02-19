import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import app from "../src/index";

let originalFetch: typeof globalThis.fetch | undefined;
let originalToken: string | undefined;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  originalToken = Bun.env.GITHUB_TOKEN;
  Bun.env.GITHUB_TOKEN = "test";
});

afterEach(() => {
  if (originalFetch) globalThis.fetch = originalFetch;
  if (typeof originalToken === "string") {
    Bun.env.GITHUB_TOKEN = originalToken;
  } else {
    delete Bun.env.GITHUB_TOKEN;
  }
});

describe("index routes", () => {
  it("serves metadata at root", async () => {
    const res = await app.handle(new Request("http://localhost/"));
    const body = (await res.json()) as { usage: string; themes: string };

    expect(res.status).toBe(200);
    expect(body.usage).toBe("GET /card/:username");
    expect(body.themes).toBe("GET /:username/themes");
  });

  it("serves metadata JSON", async () => {
    const res = await app.handle(new Request("http://localhost/meta"));
    const body = (await res.json()) as { message: string };

    expect(res.status).toBe(200);
    expect(body.message).toBe("GitHub Profile Card API");
  });

  it("serves user themes SVG", async () => {
    globalThis.fetch = (async (input: Request | string | URL) => {
      const url = input.toString();
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
    }) as unknown as typeof fetch;

    const res = await app.handle(new Request("http://localhost/octocat/themes"));
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
    expect(body).toContain("default");
    expect(body).toContain("tokyonight");
  });

  it("serves health and cache telemetry", async () => {
    const res = await app.handle(new Request("http://localhost/health"));
    const body = (await res.json()) as {
      status: string;
      cache: { total: number };
      redisReachable: boolean;
    };

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(typeof body.cache.total).toBe("number");
    expect(typeof body.redisReachable).toBe("boolean");
  });

  it("returns 200 and CORS header for card endpoint", async () => {
    globalThis.fetch = (async (input: Request | string | URL) => {
      const url = input.toString();
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
    }) as unknown as typeof fetch;

    const res = await app.handle(new Request("http://localhost/card/octocat"));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("returns 401 for GitHub auth failures", async () => {
    globalThis.fetch = (async (input: Request | string | URL) => {
      const url = input.toString();
      if (url.includes("api.github.com/graphql")) {
        return new Response("Bad credentials", { status: 401 });
      }

      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      });
    }) as unknown as typeof fetch;

    const res = await app.handle(new Request("http://localhost/card/auth-fail-user"));
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(401);
    expect(body.error).toContain("authentication");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("rejects invalid usernames via route validation", async () => {
    const res = await app.handle(new Request("http://localhost/card/invalid*name"));
    expect(res.status).toBe(422);
  });

  it("supports ETag conditional requests", async () => {
    globalThis.fetch = (async (input: Request | string | URL) => {
      const url = input.toString();
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
    }) as unknown as typeof fetch;

    const first = await app.handle(new Request("http://localhost/card/octocat"));
    const etag = first.headers.get("etag");

    expect(first.status).toBe(200);
    expect(etag).toBeTruthy();

    const second = await app.handle(
      new Request("http://localhost/card/octocat", {
        headers: { "If-None-Match": String(etag) },
      }),
    );

    expect(second.status).toBe(304);
    expect(second.headers.get("etag")).toBe(etag);
  });

  it("serves OpenAPI JSON documentation", async () => {
    const res = await app.handle(new Request("http://localhost/openapi/json"));
    expect(res.status).toBe(200);

    const spec = (await res.json()) as { openapi: string };
    expect(spec.openapi.startsWith("3.")).toBe(true);
  });

  it("handles CORS preflight requests", async () => {
    const res = await app.handle(
      new Request("http://localhost/card/octocat", {
        method: "OPTIONS",
        headers: {
          Origin: "https://example.com",
          "Access-Control-Request-Method": "GET",
        },
      }),
    );

    expect([200, 204]).toContain(res.status);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://example.com");
  });
});
