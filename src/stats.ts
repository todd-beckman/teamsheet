// HP / other-stat formulas and alignment multipliers.

import type { StatBlock } from "./types.js";
import type { BaseStats } from "./pokedex.js";
import { natures } from "./natures.js";

/**
 * Nature multiplier for a single stat:
 * - 1.1 if the stat is the nature's boosted (plus) stat
 * - 0.9 if the stat is the nature's lowered (minus) stat
 * - 1   otherwise, for HP, for unknown/blank natures, and for neutral
 *       natures where plus === minus.
 */
export function alignmentMultiplier(
  nature: string,
  stat: keyof StatBlock,
): number {
  if (stat === "hp") return 1;
  const alignment = natures[nature];
  if (!alignment) return 1;
  const { plus, minus } = alignment;
  if (plus === minus) return 1; // neutral nature => no net change
  if (stat === plus) return 1.1;
  if (stat === minus) return 0.9;
  return 1;
}

/**
 * Compute the printed stat block:
 *   HP        = base.hp + ev + 75
 *   OtherStat = floor((base + ev + 20) * alignmentMultiplier)
 */
export function computeStats(
  base: BaseStats,
  evs: Partial<StatBlock>,
  nature: string,
): StatBlock {
  const ev = (k: keyof StatBlock): number => evs[k] ?? 0;
  const other = (k: keyof StatBlock): number =>
    Math.floor((base[k] + ev(k) + 20) * alignmentMultiplier(nature, k));
  return {
    hp: base.hp + ev("hp") + 75,
    atk: other("atk"),
    def: other("def"),
    spa: other("spa"),
    spd: other("spd"),
    spe: other("spe"),
  };
}

/**
 * Recover how many stat points a single stat carries, given its printed value,
 * the Pokémon's base stats and the nature alignment. This inverts `computeStats`: HP
 * points are the value minus the (base + 75) constant; for the other stats we
 * undo the +20 offset and the nature multiplier so a boosted stat isn't
 * over-counted (32 real points in a ×1.1 stat must read 32, not ~35).
 *
 * Exact for HP, neutral and boosted (×1.1) stats. For a lowered (×0.9) stat the
 * floor makes several point counts share one value, so it returns one count
 * that reproduces the value (a count at/below the minimum may come back ≤ 0).
 * Callers treat anything ≤ 0 as "no points" — see validation's budget check.
 */
export function statPointsFor(
  base: BaseStats,
  value: number,
  nature: string,
  stat: keyof StatBlock,
): number {
  if (stat === "hp") return value - base.hp - 75;
  const multiplier = alignmentMultiplier(nature, stat);
  const n = Math.ceil(value / multiplier - (base[stat] + 20));
  return n === 0 ? 0 : n; // normalize -0 → 0

}
