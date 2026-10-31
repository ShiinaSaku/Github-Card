import { describe, expect, it } from "bun:test";
import { DOMParser, type Element } from "@xmldom/xmldom";
import { Resvg } from "@resvg/resvg-js";
import { renderCard } from "../src/card";
import { renderThemeGallery } from "../src/gallery";
import { icon, measureText, themes } from "../src/utils";

const user = {
  login: "long-login-with-thirty-nine-characters",
  name: "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW",
  avatarUrl: "",
  bio: "日本語の長い自己紹介文を折り返して表示するためのテスト文章です。".repeat(3),
  pronouns: "they/them",
  twitter: "a_very_long_social_media_username",
};
const stats = { stars: 1200, repos: 4, commits: 100, prs: 9, issues: 3 };
const languages = Array.from({ length: 10 }, (_, index) => ({
  name: `Long language ${index}`,
  size: 100 - index * 5,
  color: index % 2 ? "#3178c6" : "#e34c26",
}));

function parse(svg: string) {
  return new DOMParser({
    onError: (_level, message) => {
      throw new Error(message);
    },
  }).parseFromString(svg, "image/svg+xml");
}

describe("SVG correctness", () => {
  it("keeps profile text and legends within their allotted width", () => {
    const document = parse(renderCard(user, stats, languages));
    const width = Number(document.documentElement!.getAttribute("width"));
    const contentWidth = width - 48;
    for (const text of Array.from(document.getElementsByTagName("text"))) {
      const kind = text.getAttribute("class");
      const value = text.textContent ?? "";
      if (kind === "header") {
        expect(value.endsWith("…")).toBe(true);
        expect(measureText(value, 17, 700)).toBeLessThanOrEqual(contentWidth - 76);
      } else if (kind === "meta" || kind === "bio" || kind === "twitter-text") {
        const size = kind === "meta" ? 12.5 : 11.5;
        const weight = kind === "bio" ? 400 : 500;
        expect(measureText(value, size, weight)).toBeLessThanOrEqual(contentWidth - 76);
      } else if (kind === "lang-name") {
        const columns = Math.min(3, Math.max(1, Math.floor(contentWidth / 150)));
        expect(measureText(value, 11, 500)).toBeLessThanOrEqual(contentWidth / columns - 20);
      }
    }
  });

  it("uses the same language groups and percentages in the bar and legend", () => {
    const document = parse(renderCard(user, stats, languages));
    const labels = Array.from(document.getElementsByTagName("text")).filter(
      (text) => text.getAttribute("class") === "lang-name",
    );
    const tooltips = Array.from(document.getElementsByTagName("title")).filter(
      (title) => title.parentNode?.nodeName === "rect",
    );
    expect(tooltips).toHaveLength(6);
    expect(labels).toHaveLength(6);
    expect(labels.at(-1)?.textContent).toBe(tooltips.at(-1)?.textContent);
    expect(labels.at(-1)?.textContent).toContain("Other");
    const otherTooltip = tooltips.at(-1)!;
    expect((otherTooltip.parentNode as Element).attributes.getNamedItem("fill")!.value).toBe(
      "#6b7280",
    );
  });

  it("ignores zero, negative and non-finite language sizes", () => {
    const svg = renderCard(user, stats, [
      { name: "Zero", size: 0, color: "red" },
      { name: "Negative", size: -10, color: "red" },
      { name: "NaN", size: NaN, color: "red" },
      { name: "Infinite", size: Infinity, color: "red" },
    ]);
    const document = parse(svg);
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
    expect(
      Array.from(document.getElementsByTagName("text")).filter(
        (text) => text.getAttribute("class") === "lang-name",
      ),
    ).toHaveLength(0);
  });

  it("accepts CSS colors without allowing CSS or XML injection", () => {
    const attack = "red;} *{fill:red}</style><script>alert(1)</script><style>";
    const svg = renderCard(
      { ...user, name: "Octo\u0000cat & friends 😀", bio: "See url(#example) in the docs" },
      stats,
      [{ name: "A & B", size: 1, color: "rgb(49, 120, 198)" }],
      { title_color: attack, text_color: "red", icon_color: "hsl(120, 100%, 25%)" },
    );
    const document = parse(svg);
    expect(document.getElementsByTagName("script")).toHaveLength(0);
    expect(svg).not.toContain(attack);
    expect(svg).toContain("Octocat &amp; friends 😀");
    expect(svg).toContain("url(#example)");
    expect(svg).toContain('fill="#3178c6"');
    expect(svg).toContain('fill="#008000"');
    expect(svg).toContain("fill: #ff0000");
    expect(icon("star", "red")).toContain('fill="red"');
    expect(icon("star", '#fff" onload="alert(1)')).not.toContain('onload="');
  });

  it("distinguishes unavailable metrics from real zeroes", () => {
    const document = parse(renderCard(user, { ...stats, commits: null, prs: null, issues: 0 }, []));
    const values = Array.from(document.getElementsByTagName("text"))
      .filter((text) => text.getAttribute("class") === "stat-value")
      .map((text) => text.textContent);
    expect(values).toEqual(["1.2k", "—", "0", "4", "—"]);
    expect(document.getElementsByTagName("desc")[0]!.textContent).toContain("Commits: unavailable");
  });

  it("produces stable output and optional namespaces for repeated inline cards", () => {
    const first = renderCard(user, stats, languages);
    expect(renderCard(user, stats, languages)).toBe(first);
    const repeated = renderCard(user, stats, languages, { idPrefix: "second-instance" });
    expect(parse(first).documentElement!.getAttribute("id")).not.toBe(
      parse(repeated).documentElement!.getAttribute("id"),
    );
  });

  for (const compact of [false, true]) {
    it(`isolates themes and fits every card in the gallery (compact=${compact})`, () => {
      const svg = renderThemeGallery(user, stats, languages, { compact, animate: true });
      const document = parse(svg);
      const root = document.documentElement!;
      const all = Array.from(document.getElementsByTagName("*"));
      const ids = all.map((node) => node.getAttribute("id")).filter(Boolean);
      expect(new Set(ids).size).toBe(ids.length);
      const cards = Array.from(root.childNodes).filter(
        (node): node is Element => node.nodeType === 1 && node.nodeName === "svg",
      );
      expect(cards).toHaveLength(Object.keys(themes).length);
      const rootWidth = Number(root.getAttribute("width"));
      const rootHeight = Number(root.getAttribute("height"));
      const boxes = cards.map((node) => {
        const attrs = node.attributes!;
        const get = (key: string) => Number(attrs.getNamedItem(key)!.value);
        return { x: get("x"), y: get("y"), width: get("width"), height: get("height") };
      });
      for (let i = 0; i < boxes.length; i++) {
        const box = boxes[i]!;
        expect(box.x + box.width).toBeLessThan(rootWidth);
        expect(box.y + box.height).toBeLessThan(rootHeight);
        if (i >= 2) expect(box.y).toBeGreaterThan(boxes[i - 2]!.y + boxes[i - 2]!.height);
      }
      for (const style of Array.from(document.getElementsByTagName("style"))) {
        const parentId = (style.parentNode as Element).attributes.getNamedItem("id")!.value;
        expect(style.textContent).toContain(`#${parentId} .header`);
        expect(style.textContent).not.toContain("* {");
      }
      for (const element of all) {
        for (const attr of Array.from(element.attributes)) {
          const reference = attr.value.match(/^url\(#(.+)\)$/)?.[1];
          if (reference) expect(ids).toContain(reference);
        }
      }
    });
  }

  it("rasterizes every static theme and the combined gallery", () => {
    for (const theme of Object.keys(themes)) {
      const svg = renderCard(user, stats, languages, { theme });
      const image = new Resvg(svg, { font: { loadSystemFonts: false } }).render();
      expect(image.width).toBeGreaterThan(0);
      expect(image.asPng().byteLength).toBeGreaterThan(100);
    }
    const svg = renderThemeGallery(user, stats, languages);
    const image = new Resvg(svg, {
      fitTo: { mode: "width", value: 600 },
      font: { loadSystemFonts: false },
    }).render();
    expect(image.width).toBe(600);
    expect(image.asPng().byteLength).toBeGreaterThan(1000);
  });
});
