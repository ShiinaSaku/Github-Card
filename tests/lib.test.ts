import { describe, expect, it } from "bun:test";
import * as library from "../src/lib";

describe("public library entrypoint", () => {
  it("preserves the supported runtime exports", () => {
    expect(Object.keys(library).sort()).toEqual([
      "FONT_FACE",
      "FONT_FAMILY",
      "escapeXml",
      "getLangColor",
      "icon",
      "icons",
      "kFormat",
      "measureText",
      "renderCard",
      "resolveColors",
      "themes",
      "wrapText",
    ]);
    // Retained for compatibility with consumers of the previous font API.
    expect(library.FONT_FACE).toBe("");
    expect(library.FONT_FAMILY).toContain("system-ui");
  });

  it("supports the public language-color helper", () => {
    expect(library.getLangColor("TypeScript")).toBe("#3178c6");
    expect(library.getLangColor("unknown-language")).toBe("#ccc");
  });
});
