import { describe, expect, it } from "vitest";
import { citedOrigin, classify, verify } from "@/lib/classify";

describe("classify", () => {
  it.each([
    ["Jalen Brunson ruled out vs. Celtics with ankle sprain", "injury"],
    ["Knicks sign guard to two-way contract", "transaction"],
    ["Lakers could pursue a trade for a backup center", "rumor"],
    ["Celtics' Nakamura will start in place of Ferreira", "lineup"],
    ["Nuggets beat Celtics 121-114", "result"],
    ["Fantasy basketball waiver wire: three pickups", "fantasy"],
    ["On this day: the 1986 Celtics", "history"],
    ["Film breakdown: the Lakers' new coverage", "analysis"],
    ["Coach speaks after practice", "interview"],
  ])("%s → %s", (title, type) => {
    expect(classify(title, { title }).type).toBe(type);
  });

  it("headline decides the primary type; summary only adds tags", () => {
    const r = classify("Fantasy waiver wire: pickups. Guard is sidelined with a sprained ankle.", { title: "Fantasy waiver wire: pickups" });
    expect(r.type).toBe("fantasy");
    expect(r.tags).toContain("injury");
  });

  it("videos are highlights unless they are interviews", () => {
    expect(classify("Top 10 plays of the night", { isVideo: true }).type).toBe("highlight");
    expect(classify("Postgame press conference", { isVideo: true }).type).toBe("interview");
  });

  it("a trade rumor is not classified as a done transaction", () => {
    expect(classify("Heat exploring trade for wing; Knicks interested in deal").type).toBe("rumor");
  });
});

describe("verify", () => {
  it("official only from official sources or explicit announcements", () => {
    expect(verify("Anything", "official")).toBe("official");
    expect(verify("The Knicks announced Brunson is out", "national")).toBe("official");
    expect(verify("Brunson is out, per sources", "national")).toBe("reported");
  });
  it("speculation is labeled rumor even from big outlets", () => {
    expect(verify("The Lakers could trade for a center", "national")).toBe("rumor");
  });
  it("aggregators without attribution are unconfirmed", () => {
    expect(verify("Player to sign with team", "aggregator")).toBe("unconfirmed");
  });
});

describe("citedOrigin", () => {
  it("extracts a credited reporter", () => {
    expect(citedOrigin("The deal is done, per ESPN's Shams Charania.")).toBe("Shams Charania");
    expect(citedOrigin("according to Marc Stein, talks continue")).toBe("Marc Stein");
  });
  it("never guesses", () => {
    expect(citedOrigin("per league sources")).toBeNull();
    expect(citedOrigin("No attribution here")).toBeNull();
  });
});
