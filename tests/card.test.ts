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
  it("renders valid SVG with all profile sections", () => {
    const svg = renderCard(baseUser, baseStats, baseLangs, {});

    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg.includes("The Octocat")).toBe(true);
    expect(svg.includes("@octocat")).toBe(true);
    expect(svg.includes("they/them")).toBe(true);
    expect(svg.includes("Hello from the ocean")).toBe(true);
    expect(svg.includes("@octo")).toBe(true);
    expect(svg.includes("TypeScript")).toBe(true);
    expect(svg.includes("HTML")).toBe(true);
  });

  it("renders compact output without bio, pronouns, or legend", () => {
    const svg = renderCard(baseUser, baseStats, baseLangs, { compact: true });

    expect(svg.includes("The Octocat")).toBe(true);
    expect(svg.includes("@octocat")).toBe(true);
    expect(svg.includes("Hello from the ocean")).toBe(false);
    expect(svg.includes("they/them")).toBe(false);
    expect(svg.includes("TypeScript 66.7%")).toBe(false);
    expect(svg.includes("HTML 33.3%")).toBe(false);
  });

  it("uses avatar URL in SVG", () => {
    const svg = renderCard(baseUser, baseStats, baseLangs, {});
    expect(svg.includes("https://example.com/a.png")).toBe(true);
  });

  it("hides selected stats when hide is provided", () => {
    const svg = renderCard(baseUser, baseStats, baseLangs, {
      hide: ["issues", "prs", "stars"],
    });

    expect(svg.includes("ISSUES")).toBe(false);
    expect(svg.includes("PRS")).toBe(false);
    expect(svg.includes("STARS")).toBe(false);
    expect(svg.includes("COMMITS")).toBe(true);
    expect(svg.includes("REPOS")).toBe(true);
  });

  it("renders remaining stats balanced when some are hidden", () => {
    const svg = renderCard(baseUser, baseStats, baseLangs, {
      hide: ["stars", "issues"],
    });

    expect(svg.includes("STARS")).toBe(false);
    expect(svg.includes("ISSUES")).toBe(false);
    expect(svg.includes("COMMITS")).toBe(true);
    expect(svg.includes("REPOS")).toBe(true);
    expect(svg.includes("PRS")).toBe(true);
  });

  it("uses inline system-ui font-families across the SVG", () => {
    const svg = renderCard(baseUser, baseStats, baseLangs, {});
    expect(svg.includes("font-family")).toBe(true);
    expect(svg.includes("system-ui")).toBe(true);
  });

  it("uses auto shape-rendering for smooth curves", () => {
    const svg = renderCard(baseUser, baseStats, baseLangs, {});
    expect(svg.includes('shape-rendering="crispEdges"')).toBe(false);
  });

  it("renders accessible title and description", () => {
    const svg = renderCard(baseUser, baseStats, baseLangs, {});
    expect(svg.includes("<title")).toBe(true);
    expect(svg.includes("GitHub Stats")).toBe(true);
    expect(svg.includes("<desc")).toBe(true);
    expect(svg.includes("GitHub profile card")).toBe(true);
  });

  it("renders animation tags when animate is enabled", () => {
    const svg = renderCard(baseUser, baseStats, baseLangs, { animate: true });
    expect(svg.includes("<animate")).toBe(true);
    expect(svg.includes('attributeName="width"')).toBe(true);
  });

  it("does not render animation tags when animate is disabled", () => {
    const svg = renderCard(baseUser, baseStats, baseLangs, { animate: false });
    expect(svg.includes("<animate")).toBe(false);
  });

  it("escapes user-provided text content", () => {
    const svg = renderCard(
      {
        ...baseUser,
        name: '<Octo & "Cat">',
        bio: "5 > 3 & 2 < 4",
      },
      baseStats,
      baseLangs,
      {},
    );

    expect(svg.includes("&lt;Octo &amp; &quot;Cat&quot;&gt;")).toBe(true);
    expect(svg.includes("5 &gt; 3 &amp; 2 &lt; 4")).toBe(true);
  });

  it("falls back to login when name is missing", () => {
    const svg = renderCard({ ...baseUser, name: null }, baseStats, baseLangs, {});

    expect(svg.includes(">octocat<")).toBe(true);
    expect(svg.includes("@octocat")).toBe(true);
  });

  it("renders gracefully when there are no languages", () => {
    const svg = renderCard(baseUser, baseStats, [], {});

    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg.includes("COMMITS")).toBe(true);
    // Should not contain language bar segments
    expect(svg.includes("#3178c6")).toBe(false);
  });

  it("groups tiny language bar segments instead of leaving a visual gap", () => {
    const svg = renderCard(
      baseUser,
      baseStats,
      [
        { name: "TypeScript", size: 10_000, color: "#3178c6" },
        { name: "TinyScript", size: 1, color: "#abcdef" },
      ],
      {},
    );

    expect(svg.includes("#abcdef")).toBe(false);
    expect(svg.includes("<title>Other 0.0%</title>")).toBe(true);
    expect(svg.includes('fill="#6b7280"')).toBe(true);
  });

  it("renders gracefully when there are no stats visible", () => {
    const svg = renderCard(baseUser, baseStats, baseLangs, {
      hide: ["stars", "commits", "issues", "repos", "prs"],
    });

    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg.includes("The Octocat")).toBe(true);
  });

  it("hides border when hide_border is true", () => {
    const svg = renderCard(baseUser, baseStats, baseLangs, {
      hide_border: true,
    });

    // Should not have the border rect with stroke
    expect(svg.includes('stroke-opacity="0.5"')).toBe(false);
  });

  it("shows border by default", () => {
    const svg = renderCard(baseUser, baseStats, baseLangs, {});
    expect(svg.includes('stroke-opacity="0.5"')).toBe(true);
  });

  it("handles missing optional profile fields", () => {
    const svg = renderCard(
      {
        login: "ghost",
        name: null,
        avatarUrl: "",
        bio: null,
        pronouns: null,
        twitter: null,
      },
      { stars: 0, repos: 0, prs: 0, issues: 0, commits: 0 },
      [],
      {},
    );

    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg.includes("@ghost")).toBe(true);
  });

  it("applies theme colors correctly", () => {
    const svg = renderCard(baseUser, baseStats, baseLangs, {
      theme: "tokyonight",
    });

    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    // tokyonight uses slate-900 bg (#0f172a)
    expect(svg.includes("#0f172a")).toBe(true);
  });

  it("formats large numbers with k suffix", () => {
    const svg = renderCard(
      baseUser,
      { stars: 12500, repos: 200, prs: 50, issues: 30, commits: 1500 },
      baseLangs,
      {},
    );

    expect(svg.includes("12.5k")).toBe(true);
    expect(svg.includes("1.5k")).toBe(true);
  });
});
