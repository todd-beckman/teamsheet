// Showdown text -> PokemonEntry[] (+ per-field errors) (PLAN §6).

import type { PokemonEntry, StatBlock } from "../types.js";
import { normalizeName } from "./name.js";
import { getBaseStats, resolveLookupKey, pokedex } from "../pokedex.js";
import { computeStats } from "../stats.js";
import { emptyStatBlock } from "../state.js";

/** Showdown EV-label -> StatBlock key. */
const EV_LABELS: Record<string, keyof StatBlock> = {
  HP: "hp",
  Atk: "atk",
  Def: "def",
  SpA: "spa",
  SpD: "spd",
  Spe: "spe",
};

/**
 * Parse a full Showdown export into one `PokemonEntry` per block.
 * Blocks are separated by blank lines. Trailing whitespace on every line is
 * trimmed (the fixture contains trailing spaces). A block is never thrown away
 * on a parse error — fields that cannot be resolved are flagged in
 * `fieldErrors`.
 */
export function parseShowdown(text: string): PokemonEntry[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n").map((l) => l.trimEnd());

  // Group into blocks separated by one or more blank lines.
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.trim() === "") {
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current);

  return blocks.map(parseBlock);
}

function parseBlock(block: string[]): PokemonEntry {
  const fieldErrors = new Set<keyof PokemonEntry>();
  const entry: PokemonEntry = {
    displayName: "",
    lookupName: "",
    item: "",
    ability: "",
    natureAlignment: "",
    evs: {},
    moves: [],
    computedStats: emptyStatBlock(),
    fieldErrors,
  };

  // First line: name (before first `@`) + item (after `@`).
  const firstLine = block[0] ?? "";
  const atIndex = firstLine.indexOf("@");
  const rawName = (atIndex === -1 ? firstLine : firstLine.slice(0, atIndex)).trim();
  const item = atIndex === -1 ? "" : firstLine.slice(atIndex + 1).trim();

  const { displayName, lookupName } = normalizeName(rawName);
  // Resolve to the pokedex key (the Showdown token). When it resolves, display
  // the canonical `name` (e.g. key `Indeedee-F` -> "Indeedee Female"); the key
  // stays as the lookup name for stats.
  const resolvedKey = resolveLookupKey(lookupName);
  entry.lookupName = resolvedKey ?? lookupName;
  entry.displayName = resolvedKey ? pokedex[resolvedKey].name : displayName;
  entry.item = item;

  // Remaining lines.
  for (const line of block.slice(1)) {
    if (line.startsWith("Ability:")) {
      entry.ability = line.slice("Ability:".length).trim();
    } else if (line.startsWith("Level:")) {
      // ignored
    } else if (line.startsWith("EVs:")) {
      entry.evs = parseEvs(line.slice("EVs:".length), fieldErrors);
    } else if (line.endsWith(" Nature")) {
      entry.natureAlignment = line.slice(0, line.length - " Nature".length).trim();
    } else if (line.startsWith("- ")) {
      entry.moves.push(line.slice(2).trim());
    } else if (line.startsWith("-")) {
      // Move line with no space after the dash.
      entry.moves.push(line.slice(1).trim());
    }
  }

  // Compute stats from the resolved lookup name.
  const base = getBaseStats(entry.lookupName);
  if (base === null) {
    fieldErrors.add("displayName");
    fieldErrors.add("lookupName");
    // computedStats stays zeroed.
  } else {
    entry.computedStats = computeStats(base, entry.evs, entry.natureAlignment);
  }

  return entry;
}

function parseEvs(
  body: string,
  fieldErrors: Set<keyof PokemonEntry>,
): Partial<StatBlock> {
  const evs: Partial<StatBlock> = {};
  for (const part of body.split("/")) {
    const token = part.trim();
    if (token === "") continue;
    const match = token.match(/^(\d+)\s+(\S+)$/);
    if (!match) {
      fieldErrors.add("evs");
      continue;
    }
    const value = Number.parseInt(match[1], 10);
    const key = EV_LABELS[match[2]];
    if (key === undefined || Number.isNaN(value)) {
      fieldErrors.add("evs");
      continue;
    }
    evs[key] = value;
  }
  return evs;
}
