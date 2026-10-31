import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import {
  AuthError,
  GitHubClient,
  GitHubError,
  NotFoundError,
  RateLimitError,
} from "../src/utils/github-client";

const client = new GitHubClient({ token: "test-token", userAgent: "github-card" });
const options = { variables: { login: "octocat" }, timeoutMs: 100 };

afterEach(() => mock.restore());

describe("GitHub transport", () => {
  it("sends authenticated GraphQL requests with a deadline", async () => {
    const fetch = spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ data: { login: "octocat" } }),
    );
    expect(await client.request("query Profile", options)).toEqual({ login: "octocat" });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://api.github.com/graphql");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("authorization")).toBe("bearer test-token");
    expect(new Headers(init?.headers).get("user-agent")).toBe("github-card");
    expect(JSON.parse(String(init?.body))).toEqual({
      query: "query Profile",
      variables: options.variables,
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  for (const [status, error] of [
    [401, AuthError],
    [404, NotFoundError],
    [429, RateLimitError],
    [502, GitHubError],
  ] as const) {
    it(`preserves the typed error for HTTP ${status}`, async () => {
      spyOn(globalThis, "fetch").mockResolvedValue(new Response("GitHub unavailable", { status }));
      await expect(client.request("query Profile", options)).rejects.toBeInstanceOf(error);
    });
  }

  it("classifies GraphQL errors returned with HTTP 200", async () => {
    spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ errors: [{ message: "Could not resolve to a User" }] }),
    );
    await expect(client.request("query Profile", options)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects responses without data", async () => {
    spyOn(globalThis, "fetch").mockResolvedValue(Response.json({}));
    await expect(client.request("query Profile", options)).rejects.toThrow("No data returned");
  });

  it("maps network failures to upstream errors", async () => {
    spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Connection failed"));
    await expect(client.request("query Profile", options)).rejects.toThrow(
      "Network error: Connection failed",
    );
  });

  it("keeps the deadline active while reading the response body", async () => {
    const preconnect = globalThis.fetch.preconnect;
    spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(
        async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
          new Response(
            new ReadableStream({
              start(controller) {
                init!.signal!.addEventListener(
                  "abort",
                  () => controller.error(init!.signal!.reason),
                  { once: true },
                );
              },
            }),
          ),
        { preconnect },
      ),
    );
    await expect(client.request("query Profile", { ...options, timeoutMs: 10 })).rejects.toThrow(
      "GitHub API request timed out",
    );
  });
});
