import { describe, expect, it } from "bun:test";
import { renderCard } from "../src/card";

const baseUser = {
  login: "octocat",
  name: "The Octocat",
  avatarUrl: "https://example.com/a.png",
  avatarDataUrl: "data:image/png;base64,AAAA",
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
  it("renders compact output by default", () => {
    const svg = renderCard(baseUser, baseStats, baseLangs, {});
    expect(svg.includes('class="bio"')).toBe(false);
    expect(svg.includes('class="tw"')).toBe(false);
    expect(svg.includes('class="lang"')).toBe(false);
  });

  it("renders details when compact is false", () => {
    const svg = renderCard(baseUser, baseStats, baseLangs, { compact: false });
    expect(svg.includes('class="bio"')).toBe(true);
    expect(svg.includes('class="tw"')).toBe(true);
    expect(svg.includes('class="lang"')).toBe(true);
  });

  it("uses embedded avatar when provided", () => {
    const svg = renderCard(baseUser, baseStats, baseLangs, {});
    expect(svg.includes("data:image/png;base64,AAAA")).toBe(true);
  });
});
