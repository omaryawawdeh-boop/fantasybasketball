import { describe, expect, it } from "vitest";
import { fuzzyScore, jaccard, safeUrl, stripHtml, tokens } from "@/lib/text";

describe("text utilities", () => {
  it("tokenizes, drops stopwords and stems", () => {
    expect(tokens("The Knicks are trading for a center")).toEqual(["knick", "trad", "center"]);
  });

  it("jaccard similarity", () => {
    expect(jaccard(new Set(["a", "b"]), new Set(["b", "c"]))).toBeCloseTo(1 / 3);
    expect(jaccard(new Set(), new Set(["a"]))).toBe(0);
  });

  it("fuzzy search tolerates typos and prefixes but requires every word", () => {
    expect(fuzzyScore("brunsen", "Jalen Brunson")).toBeGreaterThan(0);
    expect(fuzzyScore("jal", "Jalen Brunson")).toBeGreaterThan(0);
    expect(fuzzyScore("jalen tatum", "Jalen Brunson")).toBe(0);
    expect(fuzzyScore("jalen brunson", "Jalen Brunson")).toBeGreaterThan(fuzzyScore("brunsen", "Jalen Brunson"));
  });

  it("strips HTML into plain text (never renders markup)", () => {
    expect(stripHtml('<p>Hi <b>there</b><script>alert(1)</script> &amp; bye</p>')).toBe("Hi there & bye");
  });

  it("only allows http(s) URLs", () => {
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("https://espn.com/x")).toBe("https://espn.com/x");
    expect(safeUrl(42)).toBeNull();
  });
});
