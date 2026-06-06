// Stat formula + nature alignment tests (PLAN §7).

import { describe, it, expect } from "vitest";
import { alignmentMultiplier, computeStats } from "./stats.js";
import type { BaseStats } from "./pokedex.js";
import type { StatBlock } from "./types.js";

// A neutral base used by several cases (all stats equal so multiplier effects
// are easy to read).
const flatBase: BaseStats = { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 };

describe("alignmentMultiplier", () => {
  it("returns 1 for HP regardless of nature", () => {
    expect(alignmentMultiplier("Adamant", "hp")).toBe(1);
  });

  it("returns 1.1 for the boosted stat and 0.9 for the lowered stat (Adamant)", () => {
    // Adamant => +Atk / -SpA.
    expect(alignmentMultiplier("Adamant", "atk")).toBe(1.1);
    expect(alignmentMultiplier("Adamant", "spa")).toBe(0.9);
    expect(alignmentMultiplier("Adamant", "def")).toBe(1);
    expect(alignmentMultiplier("Adamant", "spe")).toBe(1);
  });

  it("is case-insensitive via computeStats but exact in the table (raw key)", () => {
    // The raw multiplier table is keyed exactly; lower-case keys are unknown.
    expect(alignmentMultiplier("adamant", "atk")).toBe(1); // unknown raw key => 1
    expect(alignmentMultiplier("Adamant", "atk")).toBe(1.1);
  });

  it("treats all neutral natures as ×1 on every stat", () => {
    for (const neutral of ["Hardy", "Docile", "Bashful", "Quirky", "Serious"]) {
      for (const stat of ["atk", "def", "spa", "spd", "spe"] as Array<keyof StatBlock>) {
        expect(alignmentMultiplier(neutral, stat)).toBe(1);
      }
    }
  });

  it("returns 1 for an unknown / blank nature", () => {
    expect(alignmentMultiplier("", "atk")).toBe(1);
    expect(alignmentMultiplier("NotANature", "atk")).toBe(1);
  });
});

describe("computeStats", () => {
  it("applies HP = base+ev+75 and other = floor((base+ev+20)*mult) (Sneasler, Jolly)", () => {
    // Sneasler base: hp80 atk130 def60 spa40 spd80 spe120; Jolly = +Spe/-SpA.
    const base: BaseStats = { hp: 80, atk: 130, def: 60, spa: 40, spd: 80, spe: 120 };
    const evs = { hp: 2, atk: 32, spe: 32 };
    const stats = computeStats(base, evs, "Jolly");
    expect(stats).toEqual({
      hp: 157, // 80+2+75
      atk: 182, // floor((130+32+20)*1)
      def: 80, // floor((60+0+20)*1)
      spa: 54, // floor((40+0+20)*0.9) = floor(54)
      spd: 100, // floor((80+0+20)*1)
      spe: 189, // floor((120+32+20)*1.1) = floor(189.2)
    });
  });

  it("flooring drops fractional values for boosted/lowered stats", () => {
    // (100+20)*1.1 = 132 exact; (100+20)*0.9 = 108 exact; pick base that floors.
    const base: BaseStats = { hp: 100, atk: 105, def: 100, spa: 105, spd: 100, spe: 100 };
    // Adamant => atk *1.1, spa *0.9. (105+20)*1.1 = 137.5 -> 137; (105+20)*0.9 = 112.5 -> 112.
    const stats = computeStats(base, {}, "Adamant");
    expect(stats.atk).toBe(137);
    expect(stats.spa).toBe(112);
  });

  it("treats neutral natures as all ×1 (Hardy)", () => {
    const stats = computeStats(flatBase, {}, "Hardy");
    // every other stat: floor((100+0+20)*1) = 120; hp = 100+0+75 = 175.
    expect(stats).toEqual({ hp: 175, atk: 120, def: 120, spa: 120, spd: 120, spe: 120 });
  });

  it("treats an unknown nature as all ×1", () => {
    const stats = computeStats(flatBase, {}, "Bogus");
    expect(stats).toEqual({ hp: 175, atk: 120, def: 120, spa: 120, spd: 120, spe: 120 });
  });

  it("handles a partial EV spread (only some stats invested)", () => {
    const stats = computeStats(flatBase, { hp: 4, spe: 252 }, "Timid");
    // Timid => +Spe/-Atk.
    expect(stats.hp).toBe(100 + 4 + 75); // 179
    expect(stats.atk).toBe(Math.floor((100 + 0 + 20) * 0.9)); // 108
    expect(stats.spe).toBe(Math.floor((100 + 252 + 20) * 1.1)); // floor(409.2)=409
    expect(stats.def).toBe(120);
  });

  it("handles the rare all-six EV spread", () => {
    const stats = computeStats(flatBase, { hp: 10, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 }, "Modest");
    // Modest => +SpA/-Atk.
    expect(stats.hp).toBe(100 + 10 + 75); // 185
    expect(stats.atk).toBe(Math.floor((100 + 10 + 20) * 0.9)); // floor(117)=117
    expect(stats.spa).toBe(Math.floor((100 + 10 + 20) * 1.1)); // floor(143)=143
    expect(stats.def).toBe(Math.floor((100 + 10 + 20) * 1)); // 130
  });

  it("defaults missing EVs to 0", () => {
    const base: BaseStats = { hp: 50, atk: 50, def: 50, spa: 50, spd: 50, spe: 50 };
    const stats = computeStats(base, {}, "Serious");
    expect(stats).toEqual({ hp: 125, atk: 70, def: 70, spa: 70, spd: 70, spe: 70 });
  });
});
