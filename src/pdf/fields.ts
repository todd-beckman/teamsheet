// AppState -> { fieldName: value } map (p1_* and p2_*).
//
// Pure & node-testable: no DOM, no fetch, no pdf-lib. Builds the full AcroForm
// text-field map for both pages. Page 2 is a strict subset — it omits the
// player_id / support_id / dob fields and all per-Pokémon stats — so those
// `p2_*` field names simply aren't emitted (they don't exist in the PDF).

import type { AppState, StatBlock } from "../types.js";

// The six computed stats and their PDF field-name suffixes. Note the mapping:
// `spa` -> `spatk` and `spd` -> `spdef` (the rest are 1:1).
const STAT_FIELDS: Array<{ key: keyof StatBlock; suffix: string }> = [
  { key: "hp", suffix: "hp" },
  { key: "atk", suffix: "atk" },
  { key: "def", suffix: "def" },
  { key: "spa", suffix: "spatk" },
  { key: "spd", suffix: "spdef" },
  { key: "spe", suffix: "spe" },
];

// A computed stat of 0 means "unset" by our convention (a real computed stat is
// never 0) — print an empty string rather than "0".
function statText(value: number): string {
  return value === 0 ? "" : String(value);
}

/**
 * Build the full `{ fieldName: value }` map for filling the fillable PDF.
 * Every value is a string. Page-1 (`p1_*`) carries the complete field set;
 * page-2 (`p2_*`) carries only the subset that exists on that page.
 */
export function buildFieldValues(state: AppState): Record<string, string> {
  const values: Record<string, string> = {};
  const { player, team } = state;

  // Top-level text fields shared by both pages. (Age division is NOT a text
  // field — it's a 3-option button group handled separately in fill.ts.)
  for (const page of ["p1", "p2"] as const) {
    values[`${page}_player_name`] = player.playerName;
    values[`${page}_trainer_name`] = player.trainerName;
    values[`${page}_battle_team`] = player.battleTeam;
    values[`${page}_switch_profile`] = player.switchProfile;
  }

  // Page-1-only top-level fields.
  values["p1_player_id"] = player.playerId;
  values["p1_support_id"] = player.supportId;
  values["p1_dob_1"] = player.dateOfBirth[0];
  values["p1_dob_2"] = player.dateOfBirth[1];
  values["p1_dob_3"] = player.dateOfBirth[2];

  // Per-Pokémon fields, N = 1..6.
  for (let i = 0; i < 6; i++) {
    const mon = team[i];
    const n = i + 1;
    for (const page of ["p1", "p2"] as const) {
      const prefix = `${page}_mon${n}`;
      values[`${prefix}_name`] = mon ? mon.displayName : "";
      values[`${prefix}_held_item`] = mon ? mon.item : "";
      values[`${prefix}_ability`] = mon ? mon.ability : "";
      values[`${prefix}_stat_alignment`] = mon ? mon.natureAlignment : "";
      for (let m = 0; m < 4; m++) {
        values[`${prefix}_move${m + 1}`] = mon ? (mon.moves[m] ?? "") : "";
      }
    }

    // Page-1-only stats (note spa->spatk, spd->spdef).
    for (const { key, suffix } of STAT_FIELDS) {
      values[`p1_mon${n}_${suffix}`] = mon ? statText(mon.computedStats[key]) : "";
    }
  }

  return values;
}
