// Empty AppState factory: empty player + 6 empty Pokémon slots.

import type {
  AppState,
  PlayerInfo,
  PokemonEntry,
  StatBlock,
} from "./types.js";

export function emptyStatBlock(): StatBlock {
  return { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
}

export function emptyPlayer(): PlayerInfo {
  return {
    playerName: "",
    trainerName: "",
    battleTeam: "",
    switchProfile: "",
    ageDivision: "",
    playerId: "",
    supportId: "",
    dateOfBirth: ["", "", ""],
  };
}

export function emptyPokemon(): PokemonEntry {
  return {
    displayName: "",
    lookupName: "",
    item: "",
    ability: "",
    natureAlignment: "",
    evs: {},
    moves: [],
    computedStats: emptyStatBlock(),
    fieldErrors: new Set<keyof PokemonEntry>(),
  };
}

export function createEmptyState(): AppState {
  return {
    player: emptyPlayer(),
    team: Array.from({ length: 6 }, () => emptyPokemon()),
  };
}
