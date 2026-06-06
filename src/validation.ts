// Validation logic (PLAN §8.1). Pure functions returning per-field error flags
// for the UI to surface. Milestone 5 calls `validateForExport` to gate export.
//
// Two flavours:
//   - "live" validation (default): runs while editing. Covers stat-in-range and
//     ability-matches-species. Skips species-dependent checks when the name
//     doesn't resolve.
//   - "export" validation: live checks PLUS the on-export requirements (≥1 move,
//     ability present). Built here so M5 can wire the confirm prompt.
//
// All string comparisons are case-insensitive (PLAN §8.1).

import type {
  AppState,
  PokemonEntry,
  PokemonErrors,
  StatBlock,
  ValidationResult,
} from "./types.js";
import { findSpecies } from "./pokedex.js";
import { computeStats } from "./stats.js";
import { natures } from "./natures.js";

const STAT_KEYS: Array<keyof StatBlock> = [
  "hp",
  "atk",
  "def",
  "spa",
  "spd",
  "spe",
];

// The explicit "no item" marker written on export for an item-less Pokémon.
// Treated as "no item" (not a real item) by the duplicate check.
export const NO_ITEM = "(No Item)";

function emptyErrors(): PokemonErrors {
  return {
    stats: new Set<keyof StatBlock>(),
    ability: false,
    moves: new Set<number>(),
    nature: false,
    item: false,
  };
}

/**
 * Validate a single Pokémon entry.
 *
 * Live checks (always applied):
 *   1. Stat in range — when the species AND stat alignment (nature) are both set
 *      and a stat has a non-empty numeric value, flag it invalid if outside
 *      [min, max], where min = stat at 0 stat points and max = at 32 stat points
 *      (§7 formulas with that base + nature).
 *   2. Ability matches species — when the species is set, flag the ability if it
 *      isn't (case-insensitively) one of `Species.abilities`.
 *
 * Export checks (only when `forExport` is true):
 *   3. ≥1 move — if the entry has no moves, flag the first move slot.
 *   4. Ability present — if the ability is empty, flag the ability field.
 *
 * Empty slots (no name, no ability, no moves, no stats) produce no errors during
 * live validation, and on export only contribute the missing-move/ability flags
 * — callers decide whether wholly-empty slots count (see `validate`).
 */
export function validateEntry(
  entry: PokemonEntry,
  forExport = false,
): PokemonErrors {
  const errors = emptyErrors();

  const species = findSpecies(entry.displayName);
  // Resolve the nature case-insensitively to the canonical table key so
  // `computeStats` applies the right alignment regardless of typed casing.
  const nature = resolveNature(entry.natureAlignment);

  // Stat alignment, when provided, must be one of the 25 natures.
  if (entry.natureAlignment.trim() !== "" && nature === null) {
    errors.nature = true;
  }

  // 1. Stat-in-range: requires a resolved species and a recognized nature.
  if (species && nature) {
    const minStats = computeStats(species.baseStats, zeroStatPoints(), nature);
    const maxStats = computeStats(species.baseStats, allStatPoints(32), nature);
    for (const key of STAT_KEYS) {
      const value = entry.computedStats[key];
      // Only validate non-empty numeric values. `0` is a legitimate value but a
      // computed stat is never 0 (HP/other formulas add constants), so a 0 here
      // means "unset" and is skipped.
      if (!Number.isFinite(value) || value === 0) continue;
      if (value < minStats[key] || value > maxStats[key]) {
        errors.stats.add(key);
      }
    }
  }

  // 2. Ability matches species (case-insensitive).
  const ability = entry.ability.trim();
  if (species && ability !== "") {
    const matches = species.abilities.some(
      (a) => a.toLowerCase() === ability.toLowerCase(),
    );
    if (!matches) errors.ability = true;
  }

  // 3. Moves must be filled in order with no gaps (flagged live): any empty slot
  //    that precedes a filled slot is a gap. Fewer than 4 moves is fine.
  const moveFilled = [0, 1, 2, 3].map(
    (i) => (entry.moves[i] ?? "").trim() !== "",
  );
  const lastFilled = moveFilled.lastIndexOf(true);
  for (let i = 0; i < lastFilled; i++) {
    if (!moveFilled[i]) errors.moves.add(i);
  }

  if (forExport) {
    // 4. At least one move — if none, flag the first slot.
    if (lastFilled < 0) errors.moves.add(0);
    // 5. Ability required.
    if (ability === "") errors.ability = true;
  }

  return errors;
}

/** True if a Pokémon slot is entirely empty (an unused team slot). */
export function isEmptySlot(entry: PokemonEntry): boolean {
  if (entry.displayName.trim() !== "") return false;
  if (entry.ability.trim() !== "") return false;
  if (entry.natureAlignment.trim() !== "") return false;
  if (entry.item.trim() !== "") return false;
  if (entry.moves.some((m) => m.trim() !== "")) return false;
  if (STAT_KEYS.some((k) => entry.computedStats[k] !== 0)) return false;
  return true;
}

function hasAnyError(e: PokemonErrors): boolean {
  return (
    e.stats.size > 0 || e.ability || e.moves.size > 0 || e.nature || e.item
  );
}

// Flag held items shared by more than one Pokémon (case-insensitive). Empty
// items and the explicit NO_ITEM marker are allowed to repeat.
function flagDuplicateItems(
  team: readonly PokemonEntry[],
  errors: PokemonErrors[],
): void {
  const byItem = new Map<string, number[]>();
  team.forEach((entry, i) => {
    const item = entry.item.trim().toLowerCase();
    if (item === "" || item === NO_ITEM.toLowerCase()) return;
    const list = byItem.get(item) ?? [];
    list.push(i);
    byItem.set(item, list);
  });
  for (const indices of byItem.values()) {
    if (indices.length > 1) {
      for (const i of indices) errors[i].item = true;
    }
  }
}

/**
 * Validate the whole team. For export, wholly-empty slots are skipped (an unused
 * slot is not an error); non-empty slots run every check.
 *
 * On export we also check team size (count of non-empty slots): fewer than 4 is
 * invalid; fewer than 6 is probably a mistake. Both are surfaced as a team-level
 * `message` (reason) so the export prompt can show it.
 */
export function validate(state: AppState, forExport = false): ValidationResult {
  const team = state.team.map((entry) => {
    if (forExport && isEmptySlot(entry)) return emptyErrors();
    return validateEntry(entry, forExport);
  });

  // Cross-team: duplicate held items are invalid (flagged live).
  flagDuplicateItems(state.team, team);

  const messages: string[] = [];
  const player = new Set<string>();
  if (forExport) {
    const count = state.team.filter((e) => !isEmptySlot(e)).length;
    if (count < 4) {
      messages.push(
        `A team must have at least 4 Pokémon (currently ${count}).`,
      );
    } else if (count < 6) {
      messages.push(
        `A team should have 6 Pokémon (currently ${count}) — this is probably a mistake.`,
      );
    }

    // All player information fields are required on export.
    flagEmptyPlayerFields(state.player, player);
    if (player.size > 0) {
      messages.push("All player information fields are required.");
    }
  }

  const hasErrors =
    team.some(hasAnyError) || messages.length > 0 || player.size > 0;
  return { team, player, messages, hasErrors };
}

// IDs of the required player fields (also used by the UI to flag them).
export const PLAYER_REQUIRED_FIELDS = [
  "playerName",
  "trainerName",
  "battleTeam",
  "switchProfile",
  "ageDivision",
  "playerId",
  "supportId",
  "dateOfBirth",
] as const;

// Add the id of every empty required player field to `out`. The date of birth
// is one field but three inputs — it's empty if any segment is blank.
function flagEmptyPlayerFields(
  player: AppState["player"],
  out: Set<string>,
): void {
  for (const id of PLAYER_REQUIRED_FIELDS) {
    if (id === "dateOfBirth") {
      if (player.dateOfBirth.some((seg) => seg.trim() === "")) out.add(id);
    } else if (player[id].trim() === "") {
      out.add(id);
    }
  }
}

/** Live validation (no on-export-only checks). */
export function validateLive(state: AppState): ValidationResult {
  return validate(state, false);
}

/**
 * Export-time validation (PLAN §8.1) — live checks PLUS ≥1 move and ability
 * present. Milestone 5 calls this to gate the export confirm prompt.
 */
export function validateForExport(state: AppState): ValidationResult {
  return validate(state, true);
}

function zeroStatPoints(): Partial<StatBlock> {
  return { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
}

function allStatPoints(n: number): Partial<StatBlock> {
  return { hp: n, atk: n, def: n, spa: n, spd: n, spe: n };
}

// Lazily-built case-insensitive nature lookup → canonical table key.
let natureIndex: Map<string, string> | null = null;

function resolveNature(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (natures[trimmed]) return trimmed;
  if (!natureIndex) {
    natureIndex = new Map(
      Object.keys(natures).map((k) => [k.toLowerCase(), k]),
    );
  }
  return natureIndex.get(trimmed.toLowerCase()) ?? null;
}
