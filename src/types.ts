// Core data model for Teamsheet (PLAN §4).
// All player fields are opaque, user-entered strings printed verbatim.

export interface PlayerInfo {
  playerName: string; // p1_player_name (page 1 & 2)
  trainerName: string; // p1_trainer_name (page 1 & 2)
  battleTeam: string; // p1_battle_team (page 1 & 2)
  switchProfile: string; // p1_switch_profile (page 1 & 2)
  ageDivision: string; // p1_age_division (page 1 & 2)
  playerId: string; // p1_player_id (page 1 only)
  supportId: string; // p1_support_id (page 1 only)
  dateOfBirth: [string, string, string]; // p1_dob_1/2/3, 3 raw segments (page 1 only)
}

export interface StatBlock {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

export interface PokemonEntry {
  displayName: string; // what we print in the name field
  lookupName: string; // key into pokedex for baseStats
  item: string;
  ability: string;
  natureAlignment: string; // e.g. "Adamant" (printed as Stat Alignment)
  evs: Partial<StatBlock>; // parsed EV points
  moves: string[]; // up to 4, "- " stripped
  computedStats: StatBlock; // result of §7 formulas (page 1 only)
  fieldErrors: Set<keyof PokemonEntry>; // fields flagged invalid for the UI
}

/**
 * Per-Pokémon validation result (PLAN §8.1). The legacy `fieldErrors` set on
 * `PokemonEntry` cannot express per-stat or per-move-slot granularity, so the
 * validation module (`validation.ts`) returns this richer, additive structure
 * which the UI consumes for error styling.
 *
 * - `stats`   — the set of computed stats that fall outside their valid range.
 * - `ability` — the ability field is invalid (doesn't match the species, or,
 *               on export, is missing).
 * - `moves`   — the set of invalid move slot indices (0–3): a gap (an empty slot
 *               before a filled one), and, on export with no moves, slot 0.
 * - `nature`  — stat alignment is non-empty but not one of the 25 natures.
 * - `item`    — held item duplicates another Pokémon's item (no-item repeats OK).
 */
export interface PokemonErrors {
  stats: Set<keyof StatBlock>;
  ability: boolean;
  moves: Set<number>;
  nature: boolean;
  item: boolean;
}

/** Aggregate validation result for the whole app (PLAN §8.1). */
export interface ValidationResult {
  team: PokemonErrors[]; // length 6, parallel to AppState.team
  player: Set<string>; // ids of empty required player fields (on export only)
  messages: string[]; // team-level reasons (e.g. team size) shown on export
  hasErrors: boolean; // true if any flagged error exists across the team
}

export interface AppState {
  player: PlayerInfo;
  team: PokemonEntry[]; // length 6
}
