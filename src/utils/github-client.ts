export class GitHubError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitHubError";
  }
}

export class NotFoundError extends GitHubError {
  constructor(message = "Resource not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class RateLimitError extends GitHubError {
  constructor(message = "GitHub API rate limit exceeded") {
    super(message);
    this.name = "RateLimitError";
  }
}

export class AuthError extends GitHubError {
  constructor(message = "GitHub authentication failed") {
    super(message);
    this.name = "AuthError";
  }
}

class TimeoutError extends GitHubError {
  constructor() {
    super("GitHub API request timed out");
    this.name = "TimeoutError";
  }
}

export class GitHubClient {
  constructor(private readonly options: { token: string; userAgent: string }) {}

  private classifyError(message: string, status: number): never {
    const lower = message.toLowerCase();
    if (status === 404 || lower.includes("not resolve to a user") || lower.includes("not found")) {
      throw new NotFoundError(message);
    }
    if (
      status === 429 ||
      status === 403 ||
      lower.includes("rate limit") ||
      lower.includes("abuse")
    ) {
      throw new RateLimitError(message);
    }
    if (
      status === 401 ||
      lower.includes("bad credentials") ||
      lower.includes("requires authentication")
    ) {
      throw new AuthError(message);
    }
    throw new GitHubError(message || `GitHub API error (${status})`);
  }

  async request<T>(
    query: string,
    { variables, timeoutMs }: { variables: Record<string, unknown>; timeoutMs: number },
  ): Promise<T> {
    try {
      const response = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: {
          Authorization: `bearer ${this.options.token}`,
          "Content-Type": "application/json",
          "User-Agent": this.options.userAgent,
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        const message = await response.text();
        this.classifyError(message || response.statusText, response.status);
      }

      const body = (await response.json()) as { data?: T; errors?: { message: string }[] };
      if (body.errors?.length) {
        this.classifyError(body.errors[0]?.message || "GraphQL error", response.status);
      }
      if (body.data == null) {
        throw new GitHubError("Invalid response: No data returned from GraphQL endpoint");
      }
      return body.data;
    } catch (error) {
      if (error instanceof GitHubError) throw error;
      if (
        error instanceof Error &&
        (error.name === "AbortError" || error.name === "TimeoutError")
      ) {
        throw new TimeoutError();
      }
      throw new GitHubError(
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
