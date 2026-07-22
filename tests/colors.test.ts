import { describe, expect, it } from "bun:test";
import { resolveTw, twColors } from "../src/utils/colors";
import { themes } from "../src/utils/themes";

describe("color utils", () => {
  it("resolves tailwind tokens", () => {
    expect(resolveTw("fill-slate-900", "fill")).toBe('fill="#0f172a"');
    expect(resolveTw("stroke-slate-200", "stroke")).toBe('stroke="#e2e8f0"');
  });

  it("accepts raw hex with or without #", () => {
    expect(resolveTw("0B0C10", "fill")).toBe('fill="#0B0C10"');
    expect(resolveTw("#0B0C10", "fill")).toBe('fill="#0B0C10"');
    expect(resolveTw("fff", "fill")).toBe('fill="#fff"');
  });

  it("passes through non-hex custom values", () => {
    expect(resolveTw("rebeccapurple", "fill")).toBe('fill="rebeccapurple"');
  });

  it("every built-in theme token resolves to a concrete color", () => {
    for (const [name, theme] of Object.entries(themes)) {
      for (const [slot, token] of Object.entries(theme)) {
        const property = slot === "border" ? "stroke" : "fill";
        const resolved = resolveTw(token, property as "fill" | "stroke");
        const value = resolved.match(/="([^"]+)"/)?.[1] ?? "";
        const ok = value.startsWith("#") || value === "transparent" || value === "currentColor";
        expect(ok, `theme "${name}" ${slot} token "${token}" failed to resolve`).toBe(true);
      }
    }
  });

  it("covers all palette tokens used by themes", () => {
    expect(twColors["indigo-400"]).toBe("#818cf8");
  });
});
