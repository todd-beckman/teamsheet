// Nature -> { plus, minus } stat alignment table.
// Rows = boosted stat, columns = lowered stat. HP is never affected.
// Neutral (diagonal) natures have plus === minus, yielding no net change.

import type { StatBlock } from "./types.js";

/** Stats that a nature can affect (HP is never affected). */
export type Stat = "atk" | "def" | "spa" | "spd" | "spe";

export interface NatureAlignment {
  plus?: Stat;
  minus?: Stat;
}

// Sanity: Stat is a subset of StatBlock keys.
type _AssertStatSubset = Stat extends keyof StatBlock ? true : never;
const _assertStatSubset: _AssertStatSubset = true;
void _assertStatSubset;

export const natures: Record<string, NatureAlignment> = {
  // +Atk
  Hardy: { plus: "atk", minus: "atk" },
  Lonely: { plus: "atk", minus: "def" },
  Adamant: { plus: "atk", minus: "spa" },
  Naughty: { plus: "atk", minus: "spd" },
  Brave: { plus: "atk", minus: "spe" },
  // +Def
  Bold: { plus: "def", minus: "atk" },
  Docile: { plus: "def", minus: "def" },
  Impish: { plus: "def", minus: "spa" },
  Lax: { plus: "def", minus: "spd" },
  Relaxed: { plus: "def", minus: "spe" },
  // +SpA
  Modest: { plus: "spa", minus: "atk" },
  Mild: { plus: "spa", minus: "def" },
  Bashful: { plus: "spa", minus: "spa" },
  Rash: { plus: "spa", minus: "spd" },
  Quiet: { plus: "spa", minus: "spe" },
  // +SpD
  Calm: { plus: "spd", minus: "atk" },
  Gentle: { plus: "spd", minus: "def" },
  Careful: { plus: "spd", minus: "spa" },
  Quirky: { plus: "spd", minus: "spd" },
  Sassy: { plus: "spd", minus: "spe" },
  // +Spe
  Timid: { plus: "spe", minus: "atk" },
  Hasty: { plus: "spe", minus: "def" },
  Jolly: { plus: "spe", minus: "spa" },
  Naive: { plus: "spe", minus: "spd" },
  Serious: { plus: "spe", minus: "spe" },
};
