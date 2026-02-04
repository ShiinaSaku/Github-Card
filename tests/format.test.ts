import { describe, expect, it } from "bun:test";
import { kFormat, escapeXml, wrapText } from "../src/utils/format";

describe("format utils", () => {
  it("formats numbers with k/M", () => {
    expect(kFormat(999)).toBe("999");
    expect(kFormat(1000)).toBe("1k");
    expect(kFormat(1500)).toBe("1.5k");
    expect(kFormat(1000000)).toBe("1M");
    expect(kFormat(1250000)).toBe("1.3M");
  });

  it("escapes XML characters", () => {
    expect(escapeXml("<>&\"'")).toBe("&lt;&gt;&amp;&quot;&#39;");
  });

  it("wraps text with ellipsis", () => {
    const lines = wrapText("one two three four five", 8, 2);
    expect(lines.length).toBe(2);
    expect(lines[0]).toBe("one two");
    expect(lines[1] !== undefined && lines[1].endsWith("…")).toBe(true);
  });
});
