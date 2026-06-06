// Validation tests (PLAN §8.1). Each rule, live vs export.

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

// A fully-valid Incineroar entry used as a building block.
function validIncineroar(): PokemonEntry {
  const mon = emptyPokemon();
  mon.displayName = "Incineroar";
  mon.lookupName = "Incineroar";
  mon.ability = "Intimidate";
  mon.natureAlignment = "Adamant";
  mon.item = "Sitrus Berry";
  mon.moves = ["Fake Out", "Flare Blitz", "Throat Chop", "Parting Shot"];
  mon.computedStats = computeStats(getBaseStats("Incineroar")!, {}, "Adamant");
  return mon;
}

function stateWith(team: PokemonEntry[]): AppState {
  const state = createEmptyState();
  for (let i = 0; i < team.length && i < 6; i++) state.team[i] = team[i];
  return state;
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

  it("skips stat-in-range when species or nature is missing", () => {
    const mon = validIncineroar();
    mon.natureAlignment = "";
    mon.computedStats.atk = 9999;
    expect(validateEntry(mon).stats.size).toBe(0);
  });
});

describe("rule 4: ability matches species (live, case-insensitive)", () => {
  it("accepts a matching ability regardless of case", () => {
    const mon = validIncineroar();
    mon.ability = "intimidate";
    expect(validateEntry(mon).ability).toBe(false);
  });

  it("flags an ability that the species does not have", () => {
    const mon = validIncineroar();
    mon.ability = "Levitate";
    expect(validateEntry(mon).ability).toBe(true);
  });

  it("does not flag a mismatched ability when species is unresolved", () => {
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
    const team = Array.from({ length: 6 }, (_, i) => {
      const m = validIncineroar();
      m.item = `Item ${i}`;
      return m;
    });
    const result = validateLive(stateWith(team));
    expect(result.hasErrors).toBe(false);
    expect(result.messages).toHaveLength(0);
  });

  it("wholly-empty slots are not errors on export", () => {
    const team = Array.from({ length: 6 }, (_, i) => {
      const m = validIncineroar();
      m.item = `Item ${i}`;
      return m;
    });
    const state = stateWith(team);
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
