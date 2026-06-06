// PDF field-map tests (PLAN §9.1/§9.2): page-2 subset, stat name mapping, blanks.

import { describe, it, expect } from "vitest";
import { buildFieldValues } from "./fields.js";
import { createEmptyState, emptyPokemon } from "../state.js";
import type { AppState } from "../types.js";

function populatedState(): AppState {
  const state = createEmptyState();
  state.player.playerName = "Ash";
  state.player.playerId = "12345";
  state.player.supportId = "67890";
  state.player.dateOfBirth = ["01", "02", "2026"];

  const mon = emptyPokemon();
  mon.displayName = "Eternal Floette"; // canonical display name
  mon.lookupName = "Floette-Eternal";
  mon.item = "Leftovers";
  mon.ability = "Symbiosis";
  mon.natureAlignment = "Modest";
  mon.moves = ["Dazzling Gleam", "Protect"];
  mon.computedStats = { hp: 159, atk: 100, def: 100, spa: 165, spd: 150, spe: 0 };
  state.team[0] = mon;
  return state;
}

describe("buildFieldValues", () => {
  const values = buildFieldValues(populatedState());

  it("emits page-1 stat fields but omits them on page 2", () => {
    expect(values["p1_mon1_hp"]).toBe("159");
    expect("p2_mon1_hp" in values).toBe(false);
    expect("p2_mon1_spatk" in values).toBe(false);
  });

  it("omits player_id / support_id / dob on page 2", () => {
    expect(values["p1_player_id"]).toBe("12345");
    expect(values["p1_support_id"]).toBe("67890");
    expect(values["p1_dob_1"]).toBe("01");
    expect("p2_player_id" in values).toBe(false);
    expect("p2_support_id" in values).toBe(false);
    expect("p2_dob_1" in values).toBe(false);
  });

  it("maps spa->spatk and spd->spdef", () => {
    expect(values["p1_mon1_spatk"]).toBe("165");
    expect(values["p1_mon1_spdef"]).toBe("150");
    // The literal spa/spd suffixes are never emitted.
    expect("p1_mon1_spa" in values).toBe(false);
    expect("p1_mon1_spd" in values).toBe(false);
  });

  it("renders an unset stat (0) as an empty string", () => {
    expect(values["p1_mon1_spe"]).toBe("");
  });

  it("uses the canonical displayName in the name field", () => {
    expect(values["p1_mon1_name"]).toBe("Eternal Floette");
    expect(values["p2_mon1_name"]).toBe("Eternal Floette");
  });

  it("does NOT emit an age_division text field (it is a button group)", () => {
    expect("p1_age_division" in values).toBe(false);
    expect("p2_age_division" in values).toBe(false);
  });

  it("fills fewer-than-6 slots with blank fields", () => {
    // Slot 2..6 are empty in this state.
    expect(values["p1_mon2_name"]).toBe("");
    expect(values["p1_mon6_name"]).toBe("");
    expect(values["p2_mon6_name"]).toBe("");
    expect(values["p1_mon2_hp"]).toBe("");
    expect(values["p1_mon2_move1"]).toBe("");
  });

  it("pads moves to 4 slots (missing moves are blank)", () => {
    expect(values["p1_mon1_move1"]).toBe("Dazzling Gleam");
    expect(values["p1_mon1_move2"]).toBe("Protect");
    expect(values["p1_mon1_move3"]).toBe("");
    expect(values["p1_mon1_move4"]).toBe("");
  });

  it("shares player text fields across both pages", () => {
    expect(values["p1_player_name"]).toBe("Ash");
    expect(values["p2_player_name"]).toBe("Ash");
  });
});
