// Validation logic. Pure functions returning per-field error flags
// for the UI to surface. `validateForExport` gates export.
//
// Two flavours:
//   - "live" validation (default): runs while editing. Covers stat-in-range,
//     ability-matches-Pokémon, and the cross-team Species Clause. Skips
//     Pokémon-dependent checks when the name doesn't resolve.
//   - "export" validation: live checks PLUS the on-export requirements (≥1 move,
//     ability present). Built here so M5 can wire the confirm prompt.
//
// All string comparisons are case-insensitive.

import type {
  AppState,
  PokemonEntry,
  PokemonErrors,
  StatBlock,
  ValidationResult,
} from "./types.js";
import { findPokemon } from "./pokedex.js";
import { computeStats, statPointsFor } from "./stats.js";
import { natures } from "./natures.js";

const STAT_KEYS: Array<keyof StatBlock> = [
  "hp",
  "atk",
  "def",
  "spa",
  "spd",
  "spe",
];

// Stat-point budget: each stat may hold at most 32 points, and a Pokémon may
// spend at most 66 across all six. Spending fewer than 66 is legal but flagged
// on export as a probable mistake.
export const MAX_STAT_POINTS_PER_STAT = 32;
export const MAX_STAT_POINTS_TOTAL = 66;

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
    species: false,
    reasons: new Map<string, string>(),
  };
}

// Record (and accumulate) the human-readable reason a field is flagged, used for
// the field's hover tooltip. Multiple reasons for one field are joined.
function addReason(errors: PokemonErrors, key: string, msg: string): void {
  const existing = errors.reasons.get(key);
  if (!existing) {
    errors.reasons.set(key, msg);
  } else if (!existing.includes(msg)) {
    errors.reasons.set(key, `${existing} ${msg}`);
  }
}

/**
 * Validate a single Pokémon entry.
 *
 * Live checks (always applied):
 *   1. Stat in range — when the Pokémon AND stat alignment (nature) are both set
 *      and a stat has a non-empty numeric value, flag it invalid if outside
 *      [min, max], where min = stat at 0 stat points and max = at 32 stat points
 *      (stat formulas with that base + nature).
 *   1b. Total stat-point budget — at most 66 points across all six stats (the
 *      ≤ 32-per-stat cap is the upper end of the rule-1 range).
 *   2. Ability matches the Pokémon — when the Pokémon is set, flag the ability if
 *      it isn't (case-insensitively) one of `Pokemon.abilities`.
 *
 * Export checks (only when `forExport` is true):
 *   3. ≥1 move — if the entry has no moves, flag the first move slot.
 *   4. Ability present — if the ability is empty, flag the ability field.
 *   5. Stat points fully spent — fewer than 66 across the six stats flags them
 *      (legal, but probably a mistake; `validate` adds a team-level message).
 *      Points are read at the MINIMUM that reaches each value, so when the
 *      shortfall is exactly one and the hindered stat could absorb a wasted
 *      point, the reason says so instead of asserting points are missing.
 *
 * The Species Clause (no two team members share a pokedex `num`) is cross-team
 * and so lives in `validate`/`flagDuplicateSpecies`, not here.
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

  const pokemon = findPokemon(entry.displayName);
  // Resolve the nature case-insensitively to the canonical table key so
  // `computeStats` applies the right alignment regardless of typed casing.
  const nature = resolveNature(entry.natureAlignment);

  // Stat alignment, when provided, must be one of the 25 natures.
  if (entry.natureAlignment.trim() !== "" && nature === null) {
    errors.nature = true;
    addReason(errors, "nature", "Not one of the 25 natures.");
  }

  // 1. Stat-in-range: requires a resolved Pokémon and a recognized nature. The
  //    valid window is [0 points, 32 points], so an out-of-range value is also
  //    how the "≤ 32 points per stat" cap is enforced.
  if (pokemon && nature) {
    const minStats = computeStats(pokemon.baseStats, zeroStatPoints(), nature);
    const maxStats = computeStats(
      pokemon.baseStats,
      allStatPoints(MAX_STAT_POINTS_PER_STAT),
      nature,
    );
    for (const key of STAT_KEYS) {
      const value = entry.computedStats[key];
      // Only validate non-empty numeric values. `0` is a legitimate value but a
      // computed stat is never 0 (HP/other formulas add constants), so a 0 here
      // means "unset" and is skipped.
      if (!Number.isFinite(value) || value === 0) continue;
      if (value < minStats[key]) {
        errors.stats.add(key);
        addReason(errors, `stat:${key}`, "Below the minimum for this Pokémon and nature.");
      } else if (value > maxStats[key]) {
        errors.stats.add(key);
        addReason(
          errors,
          `stat:${key}`,
          `Above the maximum (more than ${MAX_STAT_POINTS_PER_STAT} stat points).`,
        );
      }
    }
  }

  // 1b. Total stat-point budget: at most 66 points across all six stats. Over
  //     the limit is a hard error (live); under is legal but flagged on export
  //     only (the player probably forgot to spend everything).
  const points = statPoints(entry);
  if (points) {
    if (points.total > MAX_STAT_POINTS_TOTAL) {
      for (const key of points.setKeys) {
        errors.stats.add(key);
        addReason(
          errors,
          `stat:${key}`,
          `Stat points total ${points.total}, over the ${MAX_STAT_POINTS_TOTAL} limit.`,
        );
      }
    } else if (
      forExport &&
      points.setKeys.length > 0 &&
      points.total < MAX_STAT_POINTS_TOTAL
    ) {
      // If accounting for one possible wasted point on the hindered stat would
      // reach 66, the shortfall is ambiguous: either points are unallocated or a
      // point is wasted there.
      const wasteCouldExplain =
        points.wastedHindered !== null &&
        points.total + 1 >= MAX_STAT_POINTS_TOTAL;
      for (const key of points.setKeys) {
        errors.stats.add(key);
        if (wasteCouldExplain && key === points.wastedHindered) {
          addReason(
            errors,
            `stat:${key}`,
            `Stat points reach only ${points.total} of ${MAX_STAT_POINTS_TOTAL} — either some are unallocated or a point is wasted on this hindered stat.`,
          );
        } else {
          addReason(
            errors,
            `stat:${key}`,
            `Only ${points.total} of ${MAX_STAT_POINTS_TOTAL} stat points allocated.`,
          );
        }
      }
    }
  }

  // 2. Ability matches the Pokémon (case-insensitive).
  const ability = entry.ability.trim();
  if (pokemon && ability !== "") {
    const matches = pokemon.abilities.some(
      (a) => a.toLowerCase() === ability.toLowerCase(),
    );
    if (!matches) {
      errors.ability = true;
      addReason(errors, "ability", `Not an ability ${pokemon.name} can have.`);
    }
  }

  // 3. Moves must be filled in order with no gaps (flagged live): any empty slot
  //    that precedes a filled slot is a gap. Fewer than 4 moves is fine.
  const moveFilled = [0, 1, 2, 3].map(
    (i) => (entry.moves[i] ?? "").trim() !== "",
  );
  const lastFilled = moveFilled.lastIndexOf(true);
  for (let i = 0; i < lastFilled; i++) {
    if (!moveFilled[i]) {
      errors.moves.add(i);
      addReason(errors, `move:${i}`, "Moves must be filled in order, with no gaps.");
    }
  }

  if (forExport) {
    // 4. At least one move — if none, flag the first slot.
    if (lastFilled < 0) {
      errors.moves.add(0);
      addReason(errors, "move:0", "At least one move is required.");
    }
    // 5. Ability required.
    if (ability === "") {
      errors.ability = true;
      addReason(errors, "ability", "Ability is required.");
    }
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
    e.stats.size > 0 ||
    e.ability ||
    e.moves.size > 0 ||
    e.nature ||
    e.item ||
    e.species
  );
}

// Species Clause: a team may not contain two Pokémon of the same Species, i.e.
// two resolved Pokémon that share a pokedex `num`. Distinct formes of one
// Species (e.g. Ninetales and Ninetales-Alola, both num 38) count as the same
// Species and so collide. Flags the name field of every Pokémon in a colliding
// group (case-insensitive resolution; unresolved names are skipped).
function flagDuplicateSpecies(
  team: readonly PokemonEntry[],
  errors: PokemonErrors[],
): void {
  const byNum = new Map<number, number[]>();
  team.forEach((entry, i) => {
    const pokemon = findPokemon(entry.displayName);
    if (!pokemon) return;
    const list = byNum.get(pokemon.num) ?? [];
    list.push(i);
    byNum.set(pokemon.num, list);
  });
  for (const indices of byNum.values()) {
    if (indices.length > 1) {
      for (const i of indices) {
        errors[i].species = true;
        addReason(
          errors[i],
          "species",
          "Another team member is the same species (Species Clause).",
        );
      }
    }
  }
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
      for (const i of indices) {
        errors[i].item = true;
        addReason(errors[i], "item", "Another Pokémon is holding this item.");
      }
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

  // Cross-team: duplicate held items and the Species Clause are invalid
  // (flagged live).
  flagDuplicateItems(state.team, team);
  flagDuplicateSpecies(state.team, team);

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

    // Under-allocated stat points (a non-empty Pokémon with fewer than 66) are
    // valid but almost always a mistake — warn once for the whole team. When the
    // shortfall could be a wasted point on a hindered stat (a ×0.9 floor
    // collision), say so rather than asserting points are simply missing.
    let underAllocated = false;
    let wastedPointPossible = false;
    for (const entry of state.team) {
      if (isEmptySlot(entry)) continue;
      const points = statPoints(entry);
      if (
        !points ||
        points.setKeys.length === 0 ||
        points.total >= MAX_STAT_POINTS_TOTAL
      ) {
        continue;
      }
      underAllocated = true;
      if (
        points.wastedHindered !== null &&
        points.total + 1 >= MAX_STAT_POINTS_TOTAL
      ) {
        wastedPointPossible = true;
      }
    }
    if (underAllocated) {
      messages.push(
        wastedPointPossible
          ? "Some Pokémon are short of 66 stat points — either points are unallocated or a point is wasted on a hindered (−) stat."
          : "Some Pokémon have unallocated stat points (66 expected) — this is probably a mistake.",
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
 * Export-time validation — live checks PLUS ≥1 move and ability
 * present. Gates the export confirm prompt.
 */
export function validateForExport(state: AppState): ValidationResult {
  return validate(state, true);
}

// Reverse-compute the stat points on each stat that has a value, plus their
// total. A hindering (×0.9) nature can floor two point counts to the same value,
// so we assume the MINIMUM points that reach each value (negative/at-minimum
// counts clamp to 0). When the hindered stat's value could equally have been
// reached with one more point, `wastedHindered` names it — the shortfall to 66
// may then be a wasted point rather than missing allocation.
//
// Returns null when the Pokémon or nature can't be resolved — without the base
// stats and alignment the points can't be determined.
function statPoints(entry: PokemonEntry): {
  perStat: Map<keyof StatBlock, number>;
  total: number;
  setKeys: Array<keyof StatBlock>;
  wastedHindered: keyof StatBlock | null;
} | null {
  const pokemon = findPokemon(entry.displayName);
  const nature = resolveNature(entry.natureAlignment);
  if (!pokemon || !nature) return null;

  const perStat = new Map<keyof StatBlock, number>();
  const setKeys: Array<keyof StatBlock> = [];
  let total = 0;
  for (const key of STAT_KEYS) {
    const value = entry.computedStats[key];
    // A computed stat is never 0 (the formulas add constants), so 0 means unset.
    if (!Number.isFinite(value) || value === 0) continue;
    const n = statPointsFor(pokemon.baseStats, value, nature, key);
    perStat.set(key, n);
    setKeys.push(key);
    total += Math.max(0, n);
  }

  // A wasted point is only possible on the nature's lowered (hindered) stat, and
  // only when it's set and one more point than the minimum reaches the same
  // value (the ×0.9 floor collides).
  let wastedHindered: keyof StatBlock | null = null;
  const { plus, minus } = natures[nature];
  if (minus && minus !== plus && perStat.has(minus)) {
    const value = entry.computedStats[minus];
    const min = Math.max(0, perStat.get(minus)!);
    const withOneMore = computeStats(
      pokemon.baseStats,
      { [minus]: min + 1 },
      nature,
    )[minus];
    if (withOneMore === value) wastedHindered = minus;
  }

  return { perStat, total, setKeys, wastedHindered };
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
