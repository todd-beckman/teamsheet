// Name / forme / gender normalization (display vs lookup) (PLAN §6).

export interface NormalizedName {
  displayName: string; // what we print in the name field
  lookupName: string; // key into pokedex for baseStats
}

const GENDER_MARKER = /\s*\((?:M|F)\)\s*$/;

/**
 * Fixed species aliases applied to both the display and lookup name. Base
 * Floette and the (fictional) Floette-Mega are always treated as Floette-Eternal
 * — the only competitively-used Floette form (the base form is never used).
 */
export function canonicalSpecies(name: string): string {
  const lower = name.trim().toLowerCase();
  if (lower === "floette" || lower === "floette-mega") return "Floette-Eternal";
  return name;
}

/**
 * Normalize the raw name text that appears before the `@` on a Showdown
 * first line into a `{ displayName, lookupName }` pair (PLAN §6).
 */
export function normalizeName(rawNameBeforeAt: string): NormalizedName {
  let name = rawNameBeforeAt.trim();

  // 1. Strip a trailing gender marker `(M)` / `(F)`.
  name = name.replace(GENDER_MARKER, "").trim();

  // 2. If still `Outer (Inner)`, keep only `Inner` (the species; the nickname
  //    wraps the real species in parens).
  const nicknameMatch = name.match(/^.*\(([^()]+)\)\s*$/);
  if (nicknameMatch) {
    name = nicknameMatch[1].trim();
  }

  // Split on `-` to inspect forme suffixes.
  const parts = name.split("-");
  const baseSpecies = parts[0];
  const suffixes = parts.slice(1);

  // 4a. Drop `-Mega`/`-Mega-X`/`-Mega-Y`/… entirely (display + lookup).
  const megaIndex = suffixes.findIndex((s) => s === "Mega");
  const keptSuffixes =
    megaIndex === -1 ? suffixes : suffixes.slice(0, megaIndex);

  // Gender suffixes (`-F`/`-M`) and all other formes are preserved here; the
  // pokedex lookup (`resolveLookupKey`) maps gender forms to the renamed
  // "X Male" / "X Female" keys. Apply fixed species aliases (e.g.
  // Floette/Floette-Mega -> Floette-Eternal) last.
  const lookupName =
    keptSuffixes.length > 0
      ? [baseSpecies, ...keptSuffixes].join("-")
      : baseSpecies;

  const canonical = canonicalSpecies(lookupName);
  return { displayName: canonical, lookupName: canonical };
}
