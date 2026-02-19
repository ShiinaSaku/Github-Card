import { describe, expect, it } from "bun:test";
import { renderCard } from "../src/card";

const baseUser = {
  login: "octocat",
  name: "The Octocat",
  avatarUrl: "https://example.com/a.png",
  bio: "Hello from the ocean",
  pronouns: "they/them",
  twitter: "octo",
};

const baseStats = { stars: 10, repos: 2, prs: 1, issues: 0, commits: 50 };
const baseLangs = [
  { name: "TypeScript", size: 100, color: "#3178c6" },
  { name: "HTML", size: 50, color: "#e34c26" },
];

describe("renderCard", () => {
  it("renders detailed output by default", () => {
    const svg = renderCard(baseUser, baseStats, baseLangs, {});
    expect(svg.includes('class="bio"')).toBe(true);
    expect(svg.includes('class="tw"')).toBe(true);
    expect(svg.includes('class="lang"')).toBe(true);
  });

  it("renders compact output when compact is true", () => {
    const svg = renderCard(baseUser, baseStats, baseLangs, { compact: true });
    expect(svg.includes('class="bio"')).toBe(false);
    expect(svg.includes('class="tw"')).toBe(false);
    expect(svg.includes('class="lang"')).toBe(false);
  });

  it("uses avatar URL in SVG", () => {
    const svg = renderCard(baseUser, baseStats, baseLangs, {});
    expect(svg.includes("https://example.com/a.png")).toBe(true);
  });

  it("hides selected stats when hide is provided", () => {
    const svg = renderCard(baseUser, baseStats, baseLangs, { hide: ["issues", "prs", "stars"] });
    expect(svg.includes("Issues")).toBe(false);
    expect(svg.includes("PRs")).toBe(false);
    expect(svg.includes("Stars")).toBe(false);
    expect(svg.includes("Commits")).toBe(true);
    expect(svg.includes("Repos")).toBe(true);
  });

  it("embeds @font-face with base64 WOFF2", () => {
    const svg = renderCard(baseUser, baseStats, baseLangs, {});
    expect(svg.includes("@font-face")).toBe(true);
    expect(svg.includes("data:font/woff2;base64,")).toBe(true);
    expect(svg.includes("'Roboto'")).toBe(true);
  });

  it("uses auto shape-rendering for smooth curves", () => {
    const svg = renderCard(baseUser, baseStats, baseLangs, {});
    expect(svg.includes('shape-rendering="auto"')).toBe(true);
    expect(svg.includes('shape-rendering="crispEdges"')).toBe(false);
  });
});
