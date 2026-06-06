// Name / forme / gender normalization tests.

import { describe, it, expect } from "vitest";
import { normalizeName, canonicalSpecies } from "./name.js";

describe("normalizeName", () => {
  it("strips a trailing (M) gender marker", () => {
    expect(normalizeName("Incineroar (M)")).toEqual({
      displayName: "Incineroar",
      lookupName: "Incineroar",
    });
  });

  it("strips a trailing (F) gender marker", () => {
    expect(normalizeName("Garchomp (F)")).toEqual({
      displayName: "Garchomp",
      lookupName: "Garchomp",
    });
  });

  it("unwraps Nickname (Species) to the inner species", () => {
    expect(normalizeName("Sneaky (Sneasler)")).toEqual({
      displayName: "Sneasler",
      lookupName: "Sneasler",
    });
  });

  it("unwraps Nickname (Species) (F) — gender then nickname", () => {
    expect(normalizeName("King (Kingambit) (F)")).toEqual({
      displayName: "Kingambit",
      lookupName: "Kingambit",
    });
  });

  it("drops a -Mega suffix entirely", () => {
    expect(normalizeName("Charizard-Mega-X")).toEqual({
      displayName: "Charizard",
      lookupName: "Charizard",
    });
    expect(normalizeName("Venusaur-Mega")).toEqual({
      displayName: "Venusaur",
      lookupName: "Venusaur",
    });
  });

  it("drops -Mega-Y but keeps the base species", () => {
    expect(normalizeName("Charizard-Mega-Y")).toEqual({
      displayName: "Charizard",
      lookupName: "Charizard",
    });
  });

  it("preserves non-Mega formes (-Alola, -Paldea-Combat, -Therian)", () => {
    expect(normalizeName("Raichu-Alola")).toEqual({
      displayName: "Raichu-Alola",
      lookupName: "Raichu-Alola",
    });
    expect(normalizeName("Tauros-Paldea-Combat")).toEqual({
      displayName: "Tauros-Paldea-Combat",
      lookupName: "Tauros-Paldea-Combat",
    });
    expect(normalizeName("Tornadus-Therian")).toEqual({
      displayName: "Tornadus-Therian",
      lookupName: "Tornadus-Therian",
    });
  });

  it("preserves a gender forme suffix -F for lookup resolution", () => {
    expect(normalizeName("Indeedee-F")).toEqual({
      displayName: "Indeedee-F",
      lookupName: "Indeedee-F",
    });
  });

  it("aliases Floette and (fictional) Floette-Mega to Floette-Eternal on import", () => {
    expect(normalizeName("Floette")).toEqual({
      displayName: "Floette-Eternal",
      lookupName: "Floette-Eternal",
    });
    expect(normalizeName("Floette-Mega")).toEqual({
      displayName: "Floette-Eternal",
      lookupName: "Floette-Eternal",
    });
  });

  it("aliases Flower (Floette-Mega) (F) to Floette-Eternal", () => {
    expect(normalizeName("Flower (Floette-Mega) (F)")).toEqual({
      displayName: "Floette-Eternal",
      lookupName: "Floette-Eternal",
    });
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeName("  Talonflame  ")).toEqual({
      displayName: "Talonflame",
      lookupName: "Talonflame",
    });
  });
});

describe("canonicalSpecies", () => {
  it("aliases Floette / Floette-Mega to Floette-Eternal (case-insensitive)", () => {
    expect(canonicalSpecies("Floette")).toBe("Floette-Eternal");
    expect(canonicalSpecies("floette-mega")).toBe("Floette-Eternal");
  });

  it("leaves Floette-Eternal and other species untouched", () => {
    expect(canonicalSpecies("Floette-Eternal")).toBe("Floette-Eternal");
    expect(canonicalSpecies("Pikachu")).toBe("Pikachu");
  });
});
