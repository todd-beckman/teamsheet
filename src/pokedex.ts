// Pokédex lookup adapter.
// Imports the static pokedex data module (src/pokedex-data.ts) and exposes a
// single exact-match base-stat lookup.

import { pokedex } from "./pokedex-data.js";

export type { BaseStats, Pokemon } from "./pokedex-data.js";
import type { BaseStats } from "./pokedex-data.js";

import type { Pokemon } from "./pokedex-data.js";

export { pokedex };

/**
 * Return the base stats for an exact `lookupName` key (formes included),
 * or `null` when the name does not resolve.
 */
export function getBaseStats(lookupName: string): BaseStats | null {
  const pokemon = pokedex[lookupName];
  return pokemon ? pokemon.baseStats : null;
}

// Lazily-built case-insensitive index keyed by lower-cased pokedex key and
// `Pokemon.name`, mapping to the canonical pokedex key so a user-typed name
// resolves (and yields a usable lookup key) regardless of casing.
let lowerIndex: Map<string, string> | null = null;

function getLowerIndex(): Map<string, string> {
  if (lowerIndex) return lowerIndex;
  const index = new Map<string, string>();
  for (const [key, pokemon] of Object.entries(pokedex)) {
    // Both the Showdown-token key and the canonical `name` resolve to the key.
    index.set(key.toLowerCase(), key);
    index.set(pokemon.name.toLowerCase(), key);
    // A gendered male key (the base `X` for which `X-F` also exists) also accepts
    // the explicit `X-M` Showdown token (e.g. `Nidoran-M` -> `Nidoran`).
    if (pokedex[`${key}-F`]) index.set(`${key.toLowerCase()}-m`, key);
  }
  lowerIndex = index;
  return index;
}

/**
 * Resolve a user-entered name to the canonical pokedex key: exact key match
 * first, else a case-insensitive match against keys / `Pokemon.name`. Returns
 * `null` when the name does not resolve. The returned key is suitable for
 * `entry.lookupName` and `getBaseStats`.
 */
export function resolveLookupKey(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (pokedex[trimmed]) return trimmed;
  return getLowerIndex().get(trimmed.toLowerCase()) ?? null;
}

/**
 * Resolve a user-entered name to a pokedex Pokémon (a single forme): exact key
 * match first, else a case-insensitive match against keys / `Pokemon.name`.
 * Returns `null` when the name does not resolve.
 */
export function findPokemon(name: string): Pokemon | null {
  const key = resolveLookupKey(name);
  return key ? pokedex[key] : null;
}
