// Showdown parser tests against the real example fixture.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseShowdown } from "./parse.js";

// vitest runs from the repo root; the fixture lives under resources/.
const exampleText = readFileSync(
  resolve(process.cwd(), "resources/showdown-example.txt"),
  "utf8",
);

describe("parseShowdown(example)", () => {
  const team = parseShowdown(exampleText);

  it("parses exactly 6 Pokémon", () => {
    expect(team).toHaveLength(6);
  });

  it("parses the first mon (Sneasler) — nickname unwrap, item, ability, EVs, nature, moves", () => {
    const mon = team[0];
    expect(mon.displayName).toBe("Sneasler");
    expect(mon.lookupName).toBe("Sneasler");
    expect(mon.item).toBe("Focus Sash");
    expect(mon.ability).toBe("Poison Touch");
    expect(mon.natureAlignment).toBe("Jolly");
    expect(mon.evs).toEqual({ hp: 2, atk: 32, spe: 32 });
    expect(mon.moves).toEqual(["Fake Out", "Close Combat", "Dire Claw", "Protect"]);
    expect(mon.fieldErrors.size).toBe(0);
  });

  it("computes Sneasler stats via the stat formulas (Jolly)", () => {
    expect(team[0].computedStats).toEqual({
      hp: 157,
      atk: 182,
      def: 80,
      spa: 54,
      spd: 100,
      spe: 189,
    });
  });

  it("handles a no-nickname mon (Incineroar)", () => {
    const inc = team[1];
    expect(inc.displayName).toBe("Incineroar");
    expect(inc.lookupName).toBe("Incineroar");
    expect(inc.item).toBe("Sitrus Berry");
    expect(inc.ability).toBe("Intimidate");
  });

  it("handles a no-item mon (Talonflame, last block)", () => {
    const bird = team[5];
    expect(bird.displayName).toBe("Talonflame");
    expect(bird.item).toBe("");
    expect(bird.ability).toBe("Gale Wings");
    expect(bird.moves).toEqual(["Dual Wingbeat", "Tailwind", "Will-O-Wisp", "Protect"]);
  });

  it("aliases Floette-Mega -> Floette-Eternal with the Eternal canonical name and Eternal stats", () => {
    const flower = team[4];
    expect(flower.lookupName).toBe("Floette-Eternal");
    expect(flower.displayName).toBe("Eternal Floette"); // canonical name of the key
    expect(flower.natureAlignment).toBe("Modest");
    expect(flower.evs).toEqual({ hp: 10, def: 19, spa: 5, spe: 32 });
    // Eternal base spa is 125 (not base Floette's 75): floor((125+5+20)*1.1)=165.
    expect(flower.computedStats.spa).toBe(165);
    expect(flower.computedStats.hp).toBe(159); // 74+10+75
    expect(flower.fieldErrors.size).toBe(0);
  });

  it("never throws away a block — all 6 resolve cleanly here", () => {
    for (const mon of team) {
      expect(mon.lookupName).not.toBe("");
      expect(mon.fieldErrors.size).toBe(0);
    }
  });
});

describe("parseShowdown — edge cases", () => {
  it("flags an unresolved species, zeroes stats, and does not crash", () => {
    const text = [
      "Notamon @ Leftovers",
      "Ability: Pressure",
      "Adamant Nature",
      "- Tackle",
    ].join("\n");
    const [mon] = parseShowdown(text);
    expect(mon.lookupName).toBe("Notamon"); // falls back to the normalized name
    expect(mon.fieldErrors.has("displayName")).toBe(true);
    expect(mon.fieldErrors.has("lookupName")).toBe(true);
    // Stats stay zeroed when the species can't resolve.
    expect(mon.computedStats).toEqual({
      hp: 0,
      atk: 0,
      def: 0,
      spa: 0,
      spd: 0,
      spe: 0,
    });
    // Non-name fields still parsed.
    expect(mon.ability).toBe("Pressure");
    expect(mon.moves).toEqual(["Tackle"]);
  });

  it("returns the parsed count for fewer than 6 mons (slice/pad happens at the call site)", () => {
    const text = [
      "Talonflame",
      "Ability: Gale Wings",
      "",
      "Incineroar",
      "Ability: Intimidate",
    ].join("\n");
    const team = parseShowdown(text);
    expect(team).toHaveLength(2);
    expect(team[0].displayName).toBe("Talonflame");
    expect(team[1].displayName).toBe("Incineroar");
  });

  it("returns an empty array for empty input", () => {
    expect(parseShowdown("")).toEqual([]);
    expect(parseShowdown("   \n  \n")).toEqual([]);
  });

  it("treats everything after the first @ as the item", () => {
    const [mon] = parseShowdown("Incineroar @ Choice Band\nAbility: Intimidate");
    expect(mon.item).toBe("Choice Band");
  });
});
