// Validation tests. Each rule, live vs export.

import { describe, it, expect } from "vitest";
import {
  validateEntry,
  validateLive,
  validateForExport,
  NO_ITEM,
} from "./validation.js";
import { createEmptyState, emptyPokemon } from "./state.js";
import { computeStats } from "./stats.js";
import { getBaseStats } from "./pokedex.js";
import type { AppState, PokemonEntry } from "./types.js";

// A fully-valid Incineroar entry used as a building block. Its stat points sum
// to exactly 66 (32 + 32 + 2), so it passes the stat-point budget checks too.
const FULL_EVS = { atk: 32, spe: 32, hp: 2 };

function validIncineroar(): PokemonEntry {
  const mon = emptyPokemon();
  mon.displayName = "Incineroar";
  mon.lookupName = "Incineroar";
  mon.ability = "Intimidate";
  mon.natureAlignment = "Adamant";
  mon.item = "Sitrus Berry";
  mon.moves = ["Fake Out", "Flare Blitz", "Throat Chop", "Parting Shot"];
  mon.computedStats = computeStats(
    getBaseStats("Incineroar")!,
    FULL_EVS,
    "Adamant",
  );
  return mon;
}

function stateWith(team: PokemonEntry[]): AppState {
  const state = createEmptyState();
  for (let i = 0; i < team.length && i < 6; i++) state.team[i] = team[i];
  return state;
}

// Six distinct Species (distinct `num`) with a valid ability each, used where a
// test needs a full team that must NOT trip the Species Clause. The FULL_EVS
// spread + Adamant yields a valid 66-point build for any base stats.
const VALID_ROSTER: ReadonlyArray<readonly [string, string]> = [
  ["Incineroar", "Intimidate"],
  ["Talonflame", "Gale Wings"],
  ["Garchomp", "Rough Skin"],
  ["Dragonite", "Multiscale"],
  ["Gyarados", "Moxie"],
  ["Snorlax", "Thick Fat"],
];

function validMon(name: string, ability: string): PokemonEntry {
  const mon = emptyPokemon();
  mon.displayName = name;
  mon.lookupName = name;
  mon.ability = ability;
  mon.natureAlignment = "Adamant";
  mon.moves = ["Fake Out", "Flare Blitz", "Throat Chop", "Parting Shot"];
  mon.computedStats = computeStats(getBaseStats(name)!, FULL_EVS, "Adamant");
  return mon;
}

// A team of `n` valid Pokémon of distinct Species, each with a distinct item
// (so neither the Species Clause nor the duplicate-item check fires).
function distinctValidTeam(n: number): PokemonEntry[] {
  return Array.from({ length: n }, (_, i) => {
    const [name, ability] = VALID_ROSTER[i];
    const mon = validMon(name, ability);
    mon.item = `Item ${i}`;
    return mon;
  });
}

describe("rule 1: stat in range (live)", () => {
  it("accepts a stat at the min (0 stat points) and max (32 stat points)", () => {
    const mon = validIncineroar();
    const base = getBaseStats("Incineroar")!;
    const min = computeStats(base, {}, "Adamant");
    const max = computeStats(base, { atk: 32 }, "Adamant");
    mon.computedStats.atk = min.atk;
    expect(validateEntry(mon).stats.has("atk")).toBe(false);
    mon.computedStats.atk = max.atk;
    expect(validateEntry(mon).stats.has("atk")).toBe(false);
  });

  it("flags a stat below the min and above the max", () => {
    const mon = validIncineroar();
    const base = getBaseStats("Incineroar")!;
    const min = computeStats(base, {}, "Adamant");
    const max = computeStats(base, { atk: 32 }, "Adamant");
    mon.computedStats.atk = min.atk - 1;
    expect(validateEntry(mon).stats.has("atk")).toBe(true);
    mon.computedStats.atk = max.atk + 1;
    expect(validateEntry(mon).stats.has("atk")).toBe(true);
  });

  it("skips stat-in-range when the Pokémon or nature is missing", () => {
    const mon = validIncineroar();
    mon.natureAlignment = "";
    mon.computedStats.atk = 9999;
    expect(validateEntry(mon).stats.size).toBe(0);
  });
});

describe("rule 1b: stat-point budget (32 per stat, 66 total)", () => {
  const base = getBaseStats("Incineroar")!;
  // Build an Incineroar whose stats reflect a specific stat-point spread.
  function withPoints(evs: Record<string, number>): PokemonEntry {
    const mon = validIncineroar();
    mon.computedStats = computeStats(base, evs, "Adamant");
    return mon;
  }

  it("flags a stat carrying more than 32 points (live)", () => {
    expect(validateEntry(withPoints({ hp: 33 })).stats.has("hp")).toBe(true);
  });

  it("accepts a stat at exactly 32 points", () => {
    // 32 + 32 + 2 = 66 total, none over 32.
    expect(validateEntry(withPoints({ hp: 32, atk: 32, def: 2 })).stats.has("hp")).toBe(
      false,
    );
  });

  it("flags every set stat when the total exceeds 66 (live)", () => {
    const errors = validateEntry(withPoints({ hp: 30, atk: 30, def: 30 })); // 90
    expect(errors.stats.has("hp")).toBe(true);
    expect(errors.stats.has("atk")).toBe(true);
    expect(errors.stats.has("def")).toBe(true);
  });

  it("flags under-allocation (total < 66) only on export", () => {
    const mon = withPoints({ hp: 10 }); // only 10 of 66
    expect(validateEntry(mon, false).stats.has("hp")).toBe(false);
    expect(validateEntry(mon, true).stats.has("hp")).toBe(true);
  });

  it("warns about under-allocation on export", () => {
    const result = validateForExport(stateWith([withPoints({ hp: 10 })]));
    expect(
      result.messages.some((m) => m.includes("unallocated stat points")),
    ).toBe(true);
  });

  it("skips the budget checks when the Pokémon or nature is missing", () => {
    const mon = withPoints({ hp: 99 });
    mon.natureAlignment = "";
    expect(validateEntry(mon, true).stats.size).toBe(0);
  });

  // Adamant lowers SpA (×0.9). Incineroar SpA base 80 collides at spa=11 (both
  // 10 and 11 points print 99), so a build of atk 32 + spe 23 + spa 11 = 66
  // real points reads back as only 65 under the minimum-points assumption.
  it("treats a hindered-stat collision as a possible wasted point on export", () => {
    const mon = withPoints({ atk: 32, spe: 23, spa: 11 });
    const errors = validateEntry(mon, true);
    expect(errors.stats.has("spa")).toBe(true);
    expect(errors.reasons.get("stat:spa")).toMatch(/wasted/i);
  });

  it("uses the wasted-point wording in the export message", () => {
    const result = validateForExport(stateWith([withPoints({ atk: 32, spe: 23, spa: 11 })]));
    expect(result.messages.some((m) => /wasted/i.test(m))).toBe(true);
  });

  it("does not blame a wasted point when far short of 66", () => {
    // 10 of 66 — a single wasted point can't explain the gap.
    const errors = validateEntry(withPoints({ hp: 10 }), true);
    expect(errors.reasons.get("stat:spa") ?? "").not.toMatch(/wasted/i);
    const result = validateForExport(stateWith([withPoints({ hp: 10 })]));
    expect(result.messages.some((m) => /unallocated stat points/.test(m))).toBe(true);
  });
});

describe("field reasons (for hover tooltips)", () => {
  it("explains an out-of-range stat", () => {
    const mon = validIncineroar();
    const max = computeStats(getBaseStats("Incineroar")!, { atk: 32 }, "Adamant");
    mon.computedStats.atk = max.atk + 1;
    expect(validateEntry(mon).reasons.get("stat:atk")).toMatch(/maximum/i);
  });

  it("names the Pokémon for a mismatched ability", () => {
    const mon = validIncineroar();
    mon.ability = "Levitate";
    expect(validateEntry(mon).reasons.get("ability")).toMatch(/Incineroar/);
  });

  it("explains an invalid nature", () => {
    const mon = validIncineroar();
    mon.natureAlignment = "Spicy";
    expect(validateEntry(mon).reasons.get("nature")).toBeTruthy();
  });

  it("explains a duplicate held item", () => {
    const a = validIncineroar();
    const b = validIncineroar();
    a.item = "Leftovers";
    b.item = "Leftovers";
    b.displayName = "Talonflame";
    b.lookupName = "Talonflame";
    const result = validateLive(stateWith([a, b]));
    expect(result.team[0].reasons.get("item")).toMatch(/holding this item/i);
  });

  it("explains under-allocated stat points on export", () => {
    const mon = validIncineroar();
    mon.computedStats = computeStats(getBaseStats("Incineroar")!, { hp: 10 }, "Adamant");
    expect(validateEntry(mon, true).reasons.get("stat:hp")).toMatch(/allocated/i);
  });
});

describe("rule 4: ability matches the Pokémon (live, case-insensitive)", () => {
  it("accepts a matching ability regardless of case", () => {
    const mon = validIncineroar();
    mon.ability = "intimidate";
    expect(validateEntry(mon).ability).toBe(false);
  });

  it("flags an ability that the Pokémon does not have", () => {
    const mon = validIncineroar();
    mon.ability = "Levitate";
    expect(validateEntry(mon).ability).toBe(true);
  });

  it("does not flag a mismatched ability when the Pokémon is unresolved", () => {
    const mon = validIncineroar();
    mon.displayName = "Notamon";
    mon.ability = "Levitate";
    expect(validateEntry(mon).ability).toBe(false);
  });
});

describe("rule 5: stat alignment must be a valid nature (live)", () => {
  it("accepts a valid nature case-insensitively", () => {
    const mon = validIncineroar();
    mon.natureAlignment = "adamant";
    expect(validateEntry(mon).nature).toBe(false);
  });

  it("flags an unrecognized nature", () => {
    const mon = validIncineroar();
    mon.natureAlignment = "Spicy";
    expect(validateEntry(mon).nature).toBe(true);
  });

  it("does not flag an empty nature", () => {
    const mon = validIncineroar();
    mon.natureAlignment = "";
    expect(validateEntry(mon).nature).toBe(false);
  });
});

describe("rule 2b: moves filled in order / no gaps (live)", () => {
  it("flags a gap slot (move1, _, move3 flags slot 1)", () => {
    const mon = validIncineroar();
    mon.moves = ["Fake Out", "", "Throat Chop"];
    const errors = validateEntry(mon);
    expect(errors.moves.has(1)).toBe(true);
    expect(errors.moves.has(0)).toBe(false);
    expect(errors.moves.has(2)).toBe(false);
  });

  it("accepts contiguous fewer-than-4 moves", () => {
    const mon = validIncineroar();
    mon.moves = ["Fake Out", "Flare Blitz"];
    expect(validateEntry(mon).moves.size).toBe(0);
  });
});

describe("rule 2c: no duplicate moves (live, case-insensitive)", () => {
  it("flags the later slot of a repeated move (case-insensitive)", () => {
    const mon = validIncineroar();
    mon.moves = ["Fake Out", "Flare Blitz", "fake out", "Parting Shot"];
    const errors = validateEntry(mon);
    expect(errors.moves.has(2)).toBe(true);
    expect(errors.moves.has(0)).toBe(false);
    expect(errors.moves.has(1)).toBe(false);
    expect(errors.moves.has(3)).toBe(false);
  });

  it("accepts four distinct moves", () => {
    const mon = validIncineroar();
    mon.moves = ["Fake Out", "Flare Blitz", "Throat Chop", "Parting Shot"];
    expect(validateEntry(mon).moves.size).toBe(0);
  });
});

describe("rule 2/3: ≥1 move and ability present (export only)", () => {
  it("flags the first move slot when no moves on export", () => {
    const mon = validIncineroar();
    mon.moves = [];
    expect(validateEntry(mon, false).moves.has(0)).toBe(false);
    expect(validateEntry(mon, true).moves.has(0)).toBe(true);
  });

  it("flags a missing ability only on export", () => {
    const mon = validIncineroar();
    mon.ability = "";
    expect(validateEntry(mon, false).ability).toBe(false);
    expect(validateEntry(mon, true).ability).toBe(true);
  });
});

describe("rule 7: duplicate held items (live, case-insensitive)", () => {
  it("flags both Pokémon sharing an item (case-insensitive)", () => {
    const a = validIncineroar();
    const b = validIncineroar();
    a.item = "Leftovers";
    b.item = "leftovers";
    b.displayName = "Talonflame";
    b.lookupName = "Talonflame";
    b.ability = "Gale Wings";
    const result = validateLive(stateWith([a, b]));
    expect(result.team[0].item).toBe(true);
    expect(result.team[1].item).toBe(true);
  });

  it("allows empty and (No Item) to repeat", () => {
    const a = validIncineroar();
    const b = validIncineroar();
    a.item = "";
    b.item = NO_ITEM;
    b.displayName = "Talonflame";
    b.lookupName = "Talonflame";
    b.ability = "Gale Wings";
    const result = validateLive(stateWith([a, b]));
    expect(result.team[0].item).toBe(false);
    expect(result.team[1].item).toBe(false);
  });
});

describe("rule 9: Species Clause (live — one Pokémon per Species/num)", () => {
  // Minimal entry: only the name needs to resolve for the clause to apply.
  function named(name: string): PokemonEntry {
    const mon = emptyPokemon();
    mon.displayName = name;
    return mon;
  }

  it("flags both members when they are the same Pokémon", () => {
    const result = validateLive(
      stateWith([named("Incineroar"), named("Incineroar")]),
    );
    expect(result.team[0].species).toBe(true);
    expect(result.team[1].species).toBe(true);
  });

  it("flags distinct formes that share a num as the same Species", () => {
    // Ninetales and Ninetales-Alola are different Pokémon (formes) but one
    // Species — both num 38.
    const result = validateLive(
      stateWith([named("Ninetales"), named("Ninetales-Alola")]),
    );
    expect(result.team[0].species).toBe(true);
    expect(result.team[1].species).toBe(true);
  });

  it("does not flag Pokémon of different Species", () => {
    const result = validateLive(
      stateWith([named("Incineroar"), named("Talonflame")]),
    );
    expect(result.team[0].species).toBe(false);
    expect(result.team[1].species).toBe(false);
  });

  it("ignores unresolved names (Species cannot be determined)", () => {
    const result = validateLive(
      stateWith([named("Notamon"), named("Notamon")]),
    );
    expect(result.team[0].species).toBe(false);
    expect(result.team[1].species).toBe(false);
  });

  it("explains the violation on the name field", () => {
    const result = validateLive(
      stateWith([named("Incineroar"), named("Incineroar")]),
    );
    expect(result.team[0].reasons.get("species")).toMatch(/species clause/i);
  });
});

describe("rule 6: team size (export)", () => {
  it("<4 non-empty slots is invalid", () => {
    const result = validateForExport(stateWith([validIncineroar()]));
    expect(result.messages.some((m) => m.includes("at least 4"))).toBe(true);
  });

  it("4–5 non-empty slots is a probable mistake", () => {
    const team = Array.from({ length: 4 }, (_, i) => {
      const m = validIncineroar();
      m.item = `Item ${i}`; // avoid duplicate-item errors
      return m;
    });
    const result = validateForExport(stateWith(team));
    expect(result.messages.some((m) => m.includes("probably a mistake"))).toBe(true);
  });

  it("6 non-empty slots produces no team-size message", () => {
    const team = Array.from({ length: 6 }, (_, i) => {
      const m = validIncineroar();
      m.item = `Item ${i}`;
      return m;
    });
    const result = validateForExport(stateWith(team));
    expect(result.messages.some((m) => m.includes("Pokémon"))).toBe(false);
  });
});

describe("rule 8: player fields required (export only)", () => {
  it("flags every empty player field on export", () => {
    const state = stateWith([validIncineroar()]);
    const result = validateForExport(state);
    for (const id of [
      "playerName",
      "trainerName",
      "battleTeam",
      "switchProfile",
      "ageDivision",
      "playerId",
      "supportId",
      "dateOfBirth",
    ]) {
      expect(result.player.has(id)).toBe(true);
    }
  });

  it("treats date of birth as empty if any segment is blank", () => {
    const state = stateWith([validIncineroar()]);
    state.player.dateOfBirth = ["01", "", "2026"];
    expect(validateForExport(state).player.has("dateOfBirth")).toBe(true);
    state.player.dateOfBirth = ["01", "02", "2026"];
    expect(validateForExport(state).player.has("dateOfBirth")).toBe(false);
  });

  it("does not flag player fields during live validation", () => {
    const result = validateLive(stateWith([validIncineroar()]));
    expect(result.player.size).toBe(0);
  });
});

describe("live validation skips on-export-only rules", () => {
  it("a team of valid mons with empty player info has no live errors", () => {
    const result = validateLive(stateWith(distinctValidTeam(6)));
    expect(result.hasErrors).toBe(false);
    expect(result.messages).toHaveLength(0);
  });

  it("wholly-empty slots are not errors on export", () => {
    const state = stateWith(distinctValidTeam(6));
    state.player.playerName = "A";
    state.player.trainerName = "B";
    state.player.battleTeam = "C";
    state.player.switchProfile = "D";
    state.player.ageDivision = "Masters";
    state.player.playerId = "1";
    state.player.supportId = "2";
    state.player.dateOfBirth = ["01", "02", "2026"];
    const result = validateForExport(state);
    expect(result.hasErrors).toBe(false);
  });
});
