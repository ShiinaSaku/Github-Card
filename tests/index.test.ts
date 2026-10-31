import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { app } from "../src/app";
import { version } from "../package.json";

const mockGitHubFetch = (async (input: Request | string | URL) => {
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
  }

  return new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { "Content-Type": "image/png" },
  });
}) as typeof fetch;

let originalFetch: typeof globalThis.fetch | undefined;
let originalToken: string | undefined;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  originalToken = Bun.env.GITHUB_TOKEN;
  Bun.env.GITHUB_TOKEN = "test";
  globalThis.fetch = mockGitHubFetch;
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
    const res = await app.handle(new Request("http://localhost/octocat/themes"));
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
    expect(body).toContain("default");
    expect(body).toContain("tokyonight");
    // Cards inlined as nested <svg> (GitHub camo-safe), not data-URI SVG images
    expect(body).not.toContain("data:image/svg+xml");
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
    const res = await app.handle(new Request("http://localhost/card/octocat"));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("renders organization login cards on /card/:username", async () => {
    globalThis.fetch = (async (_input: Request | string | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body || "{}"));
      const query = String(payload.query || "");

      if (query.includes("fullProfile")) {
        return new Response(
          JSON.stringify({
            errors: [{ message: "Could not resolve to a User with the login of 'acme'." }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (query.includes("fullOrg")) {
        return new Response(
          JSON.stringify({
            data: {
              organization: {
                login: "acme",
                name: "Acme Inc",
                avatarUrl: "https://avatars.githubusercontent.com/u/2?v=4",
                description: "Org profile",
                twitterUsername: "acme",
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (query.includes("paginateOrg")) {
        return new Response(
          JSON.stringify({
            data: {
              organization: {
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

    const res = await app.handle(new Request("http://localhost/card/acme"));
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
    expect(body).toContain("Acme Inc");
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
    expect(body.error).toBeDefined();
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("rejects invalid usernames via route validation", async () => {
    const res = await app.handle(new Request("http://localhost/card/invalid*name"));
    expect(res.status).toBe(422);
  });

  it("supports ETag conditional requests", async () => {
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
    expect(await second.text()).toBe("");
    for (const header of ["cache-control", "cdn-cache-control", "vercel-cdn-cache-control"]) {
      expect(second.headers.get(header)).toBe(first.headers.get(header));
    }
    expect(second.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("serves OpenAPI JSON documentation", async () => {
    const res = await app.handle(new Request("http://localhost/openapi/json"));
    expect(res.status).toBe(200);

    const spec = (await res.json()) as {
      openapi: string;
      info: { version: string };
      paths: Record<string, { get: { parameters: { name: string }[] } }>;
    };
    expect(spec.openapi.startsWith("3.")).toBe(true);
    expect(spec.info.version).toBe(version);
    expect(spec.paths["/card/{username}"]?.get.parameters.map(({ name }) => name)).toContain(
      "lang_count",
    );
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
  for (const route of ["/card/octocat", "/octocat/themes"]) {
    it(`coerces boolean, integer, and list queries on ${route}`, async () => {
      const response = await app.handle(
        `${route}?compact=true&animate=false&hide_border=true&lang_count=2&hide=stars,issues&hide=prs&show_langs=typescript,rust&orgs=elysiajs,vercel`,
      );
      const svg = await response.text();
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("image/svg+xml");
      expect(svg).not.toContain(">STARS<");
      expect(svg).not.toContain(">ISSUES<");
      expect(svg).not.toContain(">PRS<");
    });

    for (const query of [
      "compact=maybe",
      "animate=maybe",
      "lang_count=0",
      "lang_count=11",
      "lang_count=1.5",
      "scope=invalid",
      "affiliations=invalid",
    ]) {
      it(`rejects ${query} on ${route} before fetching`, async () => {
        let fetched = false;
        globalThis.fetch = (() => {
          fetched = true;
          throw new Error("Invalid requests must not fetch GitHub");
        }) as unknown as typeof fetch;
        expect((await app.handle(`${route}?${query}`)).status).toBe(422);
        expect(fetched).toBe(false);
      });
    }
  }

  for (const upstreamStatus of [404, 429, 502]) {
    it(`maps GitHub ${upstreamStatus} errors and keeps CORS headers`, async () => {
      globalThis.fetch = (async () =>
        new Response("GitHub unavailable", { status: upstreamStatus })) as unknown as typeof fetch;
      const response = await app.handle(`/card/error-${upstreamStatus}`);
      expect(response.status).toBe(upstreamStatus);
      expect(await response.json()).toEqual({ error: "GitHub unavailable" });
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
      expect(response.headers.get("cache-control")).toBeNull();
    });
  }

  it("keeps the server entrypoint compatible without starting a listener on import", async () => {
    const { default: entrypoint } = await import("../src/index");
    expect(entrypoint).toBe(app);
    expect((await entrypoint.handle("/meta")).status).toBe(200);
  });
});
