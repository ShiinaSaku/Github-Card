export class GitHubError extends Error {
  constructor(
    message: string,
    public httpStatus?: number,
    public errorCode?: string,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

export class NotFoundError extends GitHubError {
  constructor(message = "Resource not found") {
    super(message, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class RateLimitError extends GitHubError {
  constructor(
    message = "GitHub API rate limit exceeded",
    public resetAt?: Date,
  ) {
    super(message, 429, "RATE_LIMITED");
    this.name = "RateLimitError";
  }
}

export class AuthError extends GitHubError {
  constructor(message = "GitHub authentication failed") {
    super(message, 401, "UNAUTHENTICATED");
    this.name = "AuthError";
  }
}

export class TimeoutError extends GitHubError {
  constructor(message = "GitHub API request timed out") {
    super(message, 408, "TIMEOUT");
    this.name = "TimeoutError";
  }
}

export interface GitHubClientOptions {
  token?: string;
  userAgent?: string;
  timeoutMs?: number;
  baseUrl?: string;
}

export interface RequestOptions extends Omit<RequestInit, "body"> {
  variables?: Record<string, unknown>;
  timeoutMs?: number;
}

/**
 * A next-generation, generic GitHub GraphQL client.
 * Designed to be robust, strongly typed, and publishable.
 */
export class GitHubClient {
  private readonly token: string;
  private readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;

  constructor(options: GitHubClientOptions = {}) {
    const token =
      options.token || (typeof process !== "undefined" ? process.env?.GITHUB_TOKEN : "") || "";
    if (!token) {
      console.warn(
        "GitHubClient initialized without a token. Requests requiring authentication will fail.",
      );
    }

    this.token = token;
    this.userAgent = options.userAgent || "nextgen-github-client/1.0";
    this.timeoutMs = options.timeoutMs || 10000;
    this.baseUrl = options.baseUrl || "https://api.github.com/graphql";
  }

  /**
   * Classifies fetch or API errors into distinct custom error classes.
   */
  private classifyError(message: string, status: number, headers?: Headers): never {
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
      const resetHeader = headers?.get("x-ratelimit-reset");
      const resetAt = resetHeader ? new Date(parseInt(resetHeader, 10) * 1000) : undefined;
      throw new RateLimitError(message, resetAt);
    }

    if (
      status === 401 ||
      lower.includes("bad credentials") ||
      lower.includes("requires authentication")
    ) {
      throw new AuthError(message);
    }

    throw new GitHubError(message || `GitHub API error (${status})`, status);
  }

  /**
   * Executes a GraphQL query against the GitHub API.
   *
   * @param query The GraphQL query string.
   * @param options Request options including variables and fetch options.
   * @returns Strongly typed response data.
   */
  public async request<T = any>(query: string, options: RequestOptions = {}): Promise<T> {
    const { variables, timeoutMs = this.timeoutMs, signal: userSignal, ...fetchOptions } = options;

    const headers = new Headers(fetchOptions.headers);
    if (this.token && !headers.has("Authorization")) {
      headers.set("Authorization", `bearer ${this.token}`);
    }
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    if (!headers.has("User-Agent")) {
      headers.set("User-Agent", this.userAgent);
    }

    const abortController = new AbortController();
    const timeoutId =
      timeoutMs > 0
        ? setTimeout(() => abortController.abort(new TimeoutError()), timeoutMs)
        : undefined;

    // Link user-provided signal if present
    if (userSignal) {
      const onAbort = () => abortController.abort(userSignal.reason);
      userSignal.addEventListener("abort", onAbort);
      if (userSignal.aborted) abortController.abort(userSignal.reason);
    }

    let response: Response;

    try {
      response = await fetch(this.baseUrl, {
        ...fetchOptions,
        method: "POST",
        headers,
        body: JSON.stringify({ query, variables }),
        signal: abortController.signal,
      });
    } catch (error: any) {
      if (error.name === "AbortError" || error instanceof TimeoutError) {
        throw new TimeoutError(error.message || "Request timed out");
      }
      throw new GitHubError(`Network error: ${error.message || "Unknown error"}`);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      if (userSignal) {
        userSignal.removeEventListener("abort", onAbort);
      }
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      this.classifyError(errorText || response.statusText, response.status, response.headers);
    }

    const body = (await response.json().catch(() => ({}))) as any;

    if (body.errors && body.errors.length > 0) {
      // Throw the first error specifically, but could be enhanced to aggregate
      const firstError = body.errors[0];
      this.classifyError(firstError.message, response.status, response.headers);
    }

    if (!body.data) {
      throw new GitHubError(
        "Invalid response: No data returned from GraphQL endpoint",
        response.status,
      );
    }

    return body.data as T;
  }
}

// Export a default singleton instance for convenience
export const githubClient = new GitHubClient();
