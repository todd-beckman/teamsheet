// Pokédex resolution tests: key/name/gender/regional index.

import { describe, it, expect } from "vitest";
import {
  resolveLookupKey,
  findPokemon,
  getBaseStats,
  pokedex,
} from "./pokedex.js";

describe("resolveLookupKey", () => {
  it("resolves an exact Showdown-token key", () => {
    expect(resolveLookupKey("Sneasler")).toBe("Sneasler");
  });

  it("is case-insensitive against the key", () => {
    expect(resolveLookupKey("sneasler")).toBe("Sneasler");
    expect(resolveLookupKey("INCINEROAR")).toBe("Incineroar");
  });

  it("resolves via the canonical display name (case-insensitive)", () => {
    // "Indeedee Male" is the canonical name for key "Indeedee".
    expect(resolveLookupKey("Indeedee Male")).toBe("Indeedee");
    expect(resolveLookupKey("indeedee female")).toBe("Indeedee-F");
  });

  it("resolves gendered species keys X (male) and X-F (female)", () => {
    expect(resolveLookupKey("Indeedee")).toBe("Indeedee");
    expect(resolveLookupKey("Indeedee-F")).toBe("Indeedee-F");
    expect(resolveLookupKey("Meowstic")).toBe("Meowstic");
    expect(resolveLookupKey("Meowstic-F")).toBe("Meowstic-F");
  });

  it("accepts the explicit X-M token for a gendered male (Nidoran-M -> Nidoran)", () => {
    expect(resolveLookupKey("Nidoran-M")).toBe("Nidoran");
    expect(resolveLookupKey("Indeedee-M")).toBe("Indeedee");
    // The female counterpart key exists distinctly.
    expect(resolveLookupKey("Nidoran-F")).toBe("Nidoran-F");
  });

  it("resolves regional formes both by key and by canonical 'Alolan X' name", () => {
    expect(resolveLookupKey("Raichu-Alola")).toBe("Raichu-Alola");
    expect(resolveLookupKey("Alolan Raichu")).toBe("Raichu-Alola");
    // The base Pokémon stays distinct (same Species/num, different forme).
    expect(resolveLookupKey("Raichu")).toBe("Raichu");
  });

  it("keeps Floette and Floette-Eternal as distinct resolvable Pokémon (no import alias here)", () => {
    expect(resolveLookupKey("Floette")).toBe("Floette");
    expect(resolveLookupKey("Floette-Eternal")).toBe("Floette-Eternal");
    // The Eternal canonical name "Eternal Floette" also resolves.
    expect(resolveLookupKey("Eternal Floette")).toBe("Floette-Eternal");
  });

  it("returns null for an unresolved name", () => {
    expect(resolveLookupKey("Notamon")).toBeNull();
    expect(resolveLookupKey("Charizard-Mega-X")).toBeNull();
    expect(resolveLookupKey("")).toBeNull();
    expect(resolveLookupKey("   ")).toBeNull();
  });
});

describe("findPokemon", () => {
  it("returns the Pokémon record with canonical name for a gendered female", () => {
    const sp = findPokemon("Indeedee-F");
    expect(sp).not.toBeNull();
    expect(sp!.name).toBe("Indeedee Female");
  });

  it("returns the male record for the bare gendered key", () => {
    const sp = findPokemon("Indeedee");
    expect(sp!.name).toBe("Indeedee Male");
  });

  it("returns null for an unresolved name", () => {
    expect(findPokemon("Notamon")).toBeNull();
  });

  it("treats distinct formes that share a num as the same Species", () => {
    // Ninetales and Ninetales-Alola are different Pokémon (formes) but one
    // Species — they share `num` (38).
    const base = findPokemon("Ninetales");
    const alola = findPokemon("Ninetales-Alola");
    expect(base!.num).toBe(alola!.num);
    expect(base!.name).not.toBe(alola!.name);
  });
});

describe("getBaseStats", () => {
  it("returns base stats for an exact key", () => {
    expect(getBaseStats("Sneasler")).toEqual({
      hp: 80,
      atk: 130,
      def: 60,
      spa: 40,
      spd: 80,
      spe: 120,
    });
  });

  it("returns null for an unknown key", () => {
    expect(getBaseStats("Notamon")).toBeNull();
  });

  it("is keyed exactly (canonical name is not a base-stats key)", () => {
    // getBaseStats does an exact key match; the canonical display name is not a key.
    expect(getBaseStats("Indeedee Female")).toBeNull();
    expect(getBaseStats("Indeedee-F")).not.toBeNull();
  });
});

describe("pokedex data model", () => {
  it("uses key = Showdown token, name = canonical display name", () => {
    expect(pokedex["Indeedee"].name).toBe("Indeedee Male");
    expect(pokedex["Indeedee-F"].name).toBe("Indeedee Female");
    expect(pokedex["Raichu-Alola"].name).toBe("Alolan Raichu");
    expect(pokedex["Floette-Eternal"].name).toBe("Eternal Floette");
  });
});
