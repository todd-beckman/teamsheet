// Bootstrap: build the empty AppState, render the player form, wire the
// "Import Showdown" button to the import modal, and render the team table.
//
// Every input is two-way bound back into `state` on edit, and live
// validation re-flags invalid stats / abilities on every change.
// Stats are exposed as directly-editable inputs and bound straight to
// `entry.computedStats`; they are NOT auto-recomputed when name/nature change
// (see report — supersedes the older "editing recomputes stats" note, which
// assumed EV inputs that no longer exist on screen).

import { createEmptyState, emptyPokemon, emptyStatBlock } from "./state.js";
import type {
  AppState,
  PlayerInfo,
  StatBlock,
  ValidationResult,
} from "./types.js";
import { openImportModal } from "./ui/importModal.js";
import { parseShowdown } from "./showdown/parse.js";
import { resolveLookupKey, findSpecies, pokedex } from "./pokedex.js";
import {
  validateLive,
  validateForExport,
  isEmptySlot,
  NO_ITEM,
  PLAYER_REQUIRED_FIELDS,
} from "./validation.js";
import { natures } from "./natures.js";
import { fillTeamsheet, fetchTemplate } from "./pdf/fill.js";
import { downloadPdf } from "./pdf/export.js";

// In-memory application state.
const state: AppState = createEmptyState();

// Left column holds the name + Switch identity fields; the right column holds
// the age division (radios) and the tournament IDs / date of birth.
const PLAYER_FIELDS_LEFT: Array<{ key: keyof PlayerInfo; label: string }> = [
  { key: "playerName", label: "Player Name" },
  { key: "trainerName", label: "Trainer (In-Game) Name" },
  { key: "battleTeam", label: "Battle Team" },
  { key: "switchProfile", label: "Switch Profile" },
];

const AGE_DIVISIONS = ["Juniors", "Seniors", "Masters"];

// All selectable Pokémon species by canonical `name` (e.g. "Indeedee Male"),
// sorted for the Pokémon combobox.
const SPECIES_NAMES = Object.values(pokedex)
  .map((s) => s.name)
  .sort();

// The six computed stats, in display order, as a vertical list.
const POKEMON_STAT_FIELDS: Array<{
  label: string;
  key: keyof StatBlock;
}> = [
  { label: "HP", key: "hp" },
  { label: "Atk", key: "atk" },
  { label: "Def", key: "def" },
  { label: "SpA", key: "spa" },
  { label: "SpD", key: "spd" },
  { label: "Spe", key: "spe" },
];

// Live validation bookkeeping: references to the inputs whose error styling is
// re-applied on every edit. Rebuilt whenever the team is re-rendered.
interface CardInputs {
  ability: HTMLInputElement;
  nature: HTMLInputElement;
  item: HTMLInputElement;
  moves: HTMLInputElement[];
  stats: Record<keyof StatBlock, HTMLInputElement>;
}
let cardInputs: CardInputs[] = [];

// Required-player-field wrappers (the `.field` divs), keyed by field id, so the
// export check can flag empty ones. Populated by `renderPlayerForm`.
const playerFieldEls: Record<string, HTMLElement> = {};

// Build one labeled field (label + input) and return the wrapper + input.
function buildField(
  label: string,
  value: string,
  type: "text" | "number" = "text",
): { field: HTMLDivElement; input: HTMLInputElement } {
  const field = document.createElement("div");
  field.className = "field";

  const labelEl = document.createElement("label");
  labelEl.textContent = label;

  const input = document.createElement("input");
  input.type = type;
  if (type === "number") {
    input.min = "0";
    input.step = "1";
  }
  input.value = value;

  field.append(labelEl, input);
  return { field, input };
}

// Build a horizontal radio group (label + inline options) and return the
// wrapper plus the created radio inputs.
function buildRadioField(
  label: string,
  name: string,
  options: string[],
): { field: HTMLDivElement; inputs: HTMLInputElement[] } {
  const field = document.createElement("div");
  field.className = "field radio-field";

  const labelEl = document.createElement("label");
  labelEl.textContent = label;
  field.append(labelEl);

  const group = document.createElement("div");
  group.className = "radio-group";
  const inputs: HTMLInputElement[] = [];
  for (const option of options) {
    const optionLabel = document.createElement("label");
    optionLabel.className = "radio-option";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = option;

    const text = document.createElement("span");
    text.textContent = option;

    // Label to the left of the radio button.
    optionLabel.append(text, input);
    group.append(optionLabel);
    inputs.push(input);
  }

  field.append(group);
  return { field, inputs };
}

function renderPlayerForm(container: HTMLElement): void {
  const grid = document.createElement("div");
  grid.className = "player-form-grid";

  const leftCol = document.createElement("div");
  leftCol.className = "player-form-col";
  for (const { key, label } of PLAYER_FIELDS_LEFT) {
    const { field, input } = buildField(label, state.player[key] as string);
    input.addEventListener("input", () => {
      (state.player[key] as string) = input.value;
      clearPlayerError(key);
    });
    playerFieldEls[key] = field;
    leftCol.append(field);
  }

  const rightCol = document.createElement("div");
  rightCol.className = "player-form-col";

  // Age division: horizontal radios (Juniors / Seniors / Masters).
  const ageField = buildRadioField("Age Division", "ageDivision", AGE_DIVISIONS);
  for (const radio of ageField.inputs) {
    radio.checked = radio.value === state.player.ageDivision;
    radio.addEventListener("change", () => {
      if (radio.checked) state.player.ageDivision = radio.value;
      clearPlayerError("ageDivision");
    });
  }
  playerFieldEls["ageDivision"] = ageField.field;
  rightCol.append(ageField.field);

  const playerIdField = buildField("Player ID", state.player.playerId);
  playerIdField.input.addEventListener("input", () => {
    state.player.playerId = playerIdField.input.value;
    clearPlayerError("playerId");
  });
  playerFieldEls["playerId"] = playerIdField.field;
  rightCol.append(playerIdField.field);

  // Date of birth: three plain text segments shown as __ / __ / __.
  const dob = document.createElement("div");
  dob.className = "field dob-field";

  const dobLabel = document.createElement("label");
  dobLabel.textContent = "Date of Birth";

  const dobInputs = document.createElement("div");
  dobInputs.className = "dob-inputs";

  // Inline soft warning for the DOB checks: warn, never block.
  const dobWarning = document.createElement("span");
  dobWarning.className = "warning";

  for (let i = 0; i < 3; i++) {
    const seg = document.createElement("input");
    seg.type = "text";
    seg.value = state.player.dateOfBirth[i];
    seg.addEventListener("input", () => {
      state.player.dateOfBirth[i] = seg.value;
      updateDobWarning(dobWarning);
      clearPlayerError("dateOfBirth");
    });
    dobInputs.append(seg);
    if (i < 2) {
      const sep = document.createElement("span");
      sep.className = "dob-sep";
      sep.textContent = "/";
      dobInputs.append(sep);
    }
  }

  dob.append(dobLabel, dobInputs, dobWarning);
  updateDobWarning(dobWarning);
  playerFieldEls["dateOfBirth"] = dob;
  rightCol.append(dob);

  // Support ID sits below the date of birth.
  const supportIdField = buildField("Support ID", state.player.supportId);
  supportIdField.input.addEventListener("input", () => {
    state.player.supportId = supportIdField.input.value;
    clearPlayerError("supportId");
  });
  playerFieldEls["supportId"] = supportIdField.field;
  rightCol.append(supportIdField.field);

  grid.append(leftCol, rightCol);
  container.append(grid);
}

// Soft DOB validation: warn if neither of the first two segments is a
// plausible month (≤ 12), and warn if the year segment is < 2026. Never blocks.
function updateDobWarning(el: HTMLSpanElement): void {
  const [a, b, year] = state.player.dateOfBirth;
  const messages: string[] = [];

  const asMonth = (s: string): number | null => {
    const t = s.trim();
    if (t === "" || !/^\d+$/.test(t)) return null;
    return Number(t);
  };
  const ma = asMonth(a);
  const mb = asMonth(b);
  const anyEntered = a.trim() !== "" || b.trim() !== "" || year.trim() !== "";
  const firstTwoEntered = a.trim() !== "" && b.trim() !== "";

  // Ambiguous/invalid month: neither of the first two segments is ≤ 12.
  if (firstTwoEntered) {
    const aOk = ma !== null && ma >= 1 && ma <= 12;
    const bOk = mb !== null && mb >= 1 && mb <= 12;
    if (!aOk && !bOk) {
      messages.push("ambiguous/invalid month");
    }
  }

  // Year must be ≥ 2026.
  const yr = year.trim();
  if (yr !== "" && /^\d+$/.test(yr) && Number(yr) < 2026) {
    messages.push("year should be 2026 or later");
  }

  el.textContent = anyEntered && messages.length > 0 ? messages.join("; ") : "";
}

// Build one per-Pokémon card: Name and Stat Alignment span the full card width,
// then two columns — left holds Ability, Held Item and the four moves; right
// holds the six computed stats (numeric). Empty/partial slots still render every
// field blank (fewer than 6 mons → remaining slots blank).
// The 25 natures with the neutral ones (plus === minus, no net change) last.
function orderedNatures(): string[] {
  const names = Object.keys(natures);
  const isNeutral = (n: string): boolean =>
    natures[n]!.plus === natures[n]!.minus;
  return [...names.filter((n) => !isNeutral(n)), ...names.filter(isNeutral)];
}

// Build a combobox field: a labeled text input with a custom dropdown rendered
// BELOW the input (scrollable, max-height capped). Free text is still allowed.
// `getOptions()` is read each time the list opens so suggestions can be dynamic
// (e.g. abilities depend on the current species). `onValue` runs on every edit
// (typing or selecting). Returns the wrapper + the input (for binding/styling).
function buildCombobox(
  label: string,
  value: string,
  getOptions: () => string[],
  onValue: (value: string) => void,
): { field: HTMLDivElement; input: HTMLInputElement } {
  const field = document.createElement("div");
  field.className = "field";

  const labelEl = document.createElement("label");
  labelEl.textContent = label;

  const box = document.createElement("div");
  box.className = "combobox";

  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.autocomplete = "off";

  const list = document.createElement("ul");
  list.className = "combobox-list";
  list.hidden = true;

  const close = (): void => {
    list.hidden = true;
    list.replaceChildren();
  };

  // `useFilter` is false on focus (show the full list — the field's current
  // value, e.g. a pre-filled ability, must not filter the suggestions away) and
  // true while typing (filter by what was typed).
  const open = (useFilter: boolean): void => {
    const query = useFilter ? input.value.trim().toLowerCase() : "";
    // Cap the rendered options (the Pokémon list is ~1200 entries).
    const options = getOptions()
      .filter((o) => o.toLowerCase().includes(query))
      .slice(0, 50);
    list.replaceChildren();
    if (options.length === 0) {
      list.hidden = true;
      return;
    }
    for (const option of options) {
      const li = document.createElement("li");
      li.className = "combobox-option";
      li.textContent = option;
      // mousedown (not click) fires before the input's blur, and preventDefault
      // keeps focus on the input so blur doesn't pre-empt the selection.
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        input.value = option;
        onValue(option);
        close();
      });
      list.append(li);
    }
    list.hidden = false;
  };

  input.addEventListener("focus", () => open(false));
  input.addEventListener("input", () => {
    onValue(input.value);
    open(true);
  });
  input.addEventListener("blur", close);

  box.append(input, list);
  field.append(labelEl, box);
  return { field, input };
}

// Clear everything on a Pokémon entry except its name/lookup (item, ability,
// stat alignment, moves, stats), updating both state and the card's inputs.
// Used when the Pokémon is changed to a different species.
function clearEntryData(index: number): void {
  const entry = state.team[index];
  entry.item = "";
  entry.ability = "";
  entry.natureAlignment = "";
  entry.moves = [];
  entry.evs = {};
  entry.computedStats = emptyStatBlock();
  entry.fieldErrors.clear();

  const inputs = cardInputs[index];
  if (!inputs) return;
  inputs.ability.value = "";
  inputs.nature.value = "";
  inputs.item.value = "";
  inputs.moves.forEach((input) => (input.value = ""));
  for (const { key } of POKEMON_STAT_FIELDS) inputs.stats[key].value = "";
}

// A small square reorder button. Disabled (greyed) when the move isn't allowed.
function arrowButton(
  symbol: string,
  title: string,
  enabled: boolean,
  onClick: () => void,
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "arrow-btn";
  btn.textContent = symbol;
  btn.title = title;
  btn.disabled = !enabled;
  btn.addEventListener("click", onClick);
  return btn;
}

// Swap two team slots (order matters: it drives the PDF output order too) and
// re-render the team.
function swapTeam(i: number, j: number): void {
  if (j < 0 || j >= state.team.length) return;
  const t = state.team;
  [t[i], t[j]] = [t[j]!, t[i]!];
  renderTeam(state);
}

// Swap two move slots within a card (updates state + the move inputs in place).
function swapMoves(cardIndex: number, i: number, j: number): void {
  const moves = state.team[cardIndex]!.moves;
  while (moves.length <= Math.max(i, j)) moves.push("");
  [moves[i], moves[j]] = [moves[j]!, moves[i]!];
  const inputs = cardInputs[cardIndex];
  if (inputs) {
    inputs.moves[i]!.value = moves[i] ?? "";
    inputs.moves[j]!.value = moves[j] ?? "";
  }
  revalidate();
}

function buildPokemonCard(index: number): HTMLDivElement {
  const entry = state.team[index];
  const card = document.createElement("div");
  card.className = "pokemon-card";

  // Reorder control: four arrows to swap this card with a neighbor in the 2×3
  // grid (up/down swap rows, left/right swap columns). Order drives the PDF.
  const cardReorder = document.createElement("div");
  cardReorder.className = "card-reorder";
  cardReorder.append(
    arrowButton("←", "Move left", index % 2 === 1, () => swapTeam(index, index - 1)),
    arrowButton("↑", "Move up", index >= 2, () => swapTeam(index, index - 2)),
    arrowButton("↓", "Move down", index <= 3, () => swapTeam(index, index + 2)),
    arrowButton("→", "Move right", index % 2 === 0, () => swapTeam(index, index + 1)),
  );
  card.append(cardReorder);

  // Full-width Pokémon field: combobox over all available species (free text
  // still allowed). Both Floette and Floette-Eternal are selectable.
  const nameField = buildCombobox(
    "Pokémon",
    entry.displayName,
    () => SPECIES_NAMES,
    (value) => {
      entry.displayName = value;
      // Resolve the species key so stat-range / ability validation can run.
      entry.lookupName = resolveLookupKey(value) ?? "";
      revalidate();
    },
  );
  // When the Pokémon is changed to a different species (ignoring case), clear
  // the rest of the entry — the old item/ability/moves/stats no longer apply.
  // Compared on blur against the value when editing began, so typing to filter
  // the dropdown and reselecting the same species does not wipe the data.
  let nameAtFocus = entry.displayName;
  nameField.input.addEventListener("focus", () => {
    nameAtFocus = entry.displayName;
  });
  nameField.input.addEventListener("blur", () => {
    if (
      entry.displayName.trim().toLowerCase() !==
      nameAtFocus.trim().toLowerCase()
    ) {
      clearEntryData(index);
      revalidate();
    }
  });
  card.append(nameField.field);

  // Stat Alignment: combobox of the 25 natures (free text still allowed).
  const alignmentField = buildCombobox(
    "Stat Alignment",
    entry.natureAlignment,
    orderedNatures,
    (value) => {
      entry.natureAlignment = value;
      revalidate();
    },
  );
  card.append(alignmentField.field);

  // Two-column body.
  const body = document.createElement("div");
  body.className = "pokemon-body";

  // Left column: Ability, Held Item, then the four moves.
  const left = document.createElement("div");
  left.className = "pokemon-col";

  // Ability: combobox suggesting the current species' abilities (read live, so
  // it reflects whatever Name is typed when the dropdown opens).
  const abilityField = buildCombobox(
    "Ability",
    entry.ability,
    () => findSpecies(entry.displayName)?.abilities ?? [],
    (value) => {
      entry.ability = value;
      revalidate();
    },
  );
  left.append(abilityField.field);

  const itemField = buildField("Held Item", entry.item);
  itemField.input.addEventListener("input", () => {
    entry.item = itemField.input.value;
    revalidate(); // duplicate-item check is cross-team
  });
  left.append(itemField.field);

  const moveInputs: HTMLInputElement[] = [];
  for (let m = 0; m < 4; m++) {
    const moveField = buildField(`Move ${m + 1}`, entry.moves[m] ?? "");
    moveField.input.addEventListener("input", () => {
      // Keep the moves array dense enough to address slot `m` directly.
      while (entry.moves.length <= m) entry.moves.push("");
      entry.moves[m] = moveField.input.value;
    });
    // Up/down arrows to swap this move with an adjacent slot.
    const moveReorder = document.createElement("div");
    moveReorder.className = "reorder";
    moveReorder.append(
      arrowButton("▲", "Move up", m > 0, () => swapMoves(index, m, m - 1)),
      arrowButton("▼", "Move down", m < 3, () => swapMoves(index, m, m + 1)),
    );
    moveField.field.append(moveReorder);
    moveInputs.push(moveField.input);
    left.append(moveField.field);
  }

  // Right column: the six stats as numeric inputs, bound straight to
  // `entry.computedStats` (these inputs are the source of truth for stats).
  const right = document.createElement("div");
  right.className = "pokemon-col pokemon-col-stats";
  const statInputs = {} as Record<keyof StatBlock, HTMLInputElement>;
  for (const { label, key } of POKEMON_STAT_FIELDS) {
    const raw = entry.computedStats[key];
    const statField = buildField(label, raw ? String(raw) : "", "number");
    statField.input.addEventListener("input", () => {
      const v = statField.input.value.trim();
      // Empty → unset (stored as 0; a real computed stat is never 0).
      entry.computedStats[key] = v === "" ? 0 : Number(v);
      revalidate();
    });
    statInputs[key] = statField.input;
    right.append(statField.field);
  }

  cardInputs[index] = {
    ability: abilityField.input,
    nature: alignmentField.input,
    item: itemField.input,
    moves: moveInputs,
    stats: statInputs,
  };

  body.append(left, right);
  card.append(body);

  return card;
}

// (Re)build the six per-Pokémon cards into #team-table from state.team. Safe to
// call repeatedly: it clears the container first, so an import can re-render.
function renderTeam(_currentState: AppState): void {
  const container = getContainer("team-table");
  container.replaceChildren();
  cardInputs = [];

  const grid = document.createElement("div");
  grid.className = "team-grid";

  for (let i = 0; i < state.team.length; i++) {
    grid.append(buildPokemonCard(i));
  }

  container.append(grid);
  revalidate();
}

// Run live validation and apply error styling to the flagged inputs.
function revalidate(): void {
  const result = validateLive(state);
  result.team.forEach((errors, i) => {
    const inputs = cardInputs[i];
    if (!inputs) return;
    setError(inputs.ability, errors.ability);
    setError(inputs.nature, errors.nature);
    setError(inputs.item, errors.item);
    inputs.moves.forEach((input, m) => setError(input, errors.moves.has(m)));
    for (const { key } of POKEMON_STAT_FIELDS) {
      setError(inputs.stats[key], errors.stats.has(key));
    }
  });
}

function setError(input: HTMLInputElement, on: boolean): void {
  input.classList.toggle("field-error", on);
}

// Clear the export-time "required" error on a player field as it's edited.
function clearPlayerError(id: string): void {
  playerFieldEls[id]?.classList.remove("field-invalid");
}

function renderImportButton(container: HTMLElement): void {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn";
  button.textContent = "Import Showdown";
  button.addEventListener("click", () => openImportModal(handleImport));
  container.append(button);
}

function handleImport(rawText: string): void {
  // Parse the Showdown export, then fill the 6 team slots: imported Pokémon
  // first, remaining slots left blank (imports of fewer than 6 are common).
  const parsed = parseShowdown(rawText).slice(0, 6);
  state.team = Array.from(
    { length: 6 },
    (_, i) => parsed[i] ?? emptyPokemon(),
  );
  renderTeam(state);
}

function renderExportButton(container: HTMLElement): void {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn";
  button.textContent = "Export PDF";
  // Always enabled — date warnings never block export.
  button.addEventListener("click", () => {
    void handleExport();
  });
  container.append(button);
}

// Apply an export-time validation result's flags to the inputs. Mirrors
// `revalidate()` but uses `validateForExport` so the on-export-only errors
// (missing ability, missing first move) also get styled.
function applyExportErrors(): ValidationResult {
  const result = validateForExport(state);
  result.team.forEach((errors, i) => {
    const inputs = cardInputs[i];
    if (!inputs) return;
    setError(inputs.ability, errors.ability);
    setError(inputs.nature, errors.nature);
    setError(inputs.item, errors.item);
    inputs.moves.forEach((input, m) => setError(input, errors.moves.has(m)));
    for (const { key } of POKEMON_STAT_FIELDS) {
      setError(inputs.stats[key], errors.stats.has(key));
    }
  });
  // Required player fields that are empty.
  for (const id of PLAYER_REQUIRED_FIELDS) {
    playerFieldEls[id]?.classList.toggle("field-invalid", result.player.has(id));
  }
  return result;
}

async function handleExport(): Promise<void> {
  // 0. Present Pokémon with no held item get the explicit "(No Item)" marker
  //    (no item is valid). Reflect it in the input so the user sees it too.
  state.team.forEach((entry, i) => {
    if (isEmptySlot(entry) || entry.item.trim() !== "") return;
    entry.item = NO_ITEM;
    const inputs = cardInputs[i];
    if (inputs) inputs.item.value = NO_ITEM;
  });

  // 1. Run export-time validation and flag the relevant inputs (incl. the
  //    on-export-only checks: missing ability, missing first move).
  const result = applyExportErrors();

  // 2. If anything is invalid, gate export behind a confirm prompt that lists
  //    the reasons (team-level messages + a note for highlighted field errors).
  if (result.hasErrors) {
    const reasons = [...result.messages];
    const hasFieldError = result.team.some(
      (e) =>
        e.stats.size > 0 ||
        e.ability ||
        e.moves.size > 0 ||
        e.nature ||
        e.item,
    );
    if (hasFieldError) {
      reasons.push("Some Pokémon fields are invalid (highlighted in red).");
    }
    const proceed = window.confirm(
      `Validation issues were found:\n\n- ${reasons.join("\n- ")}\n\nExport anyway?`,
    );
    if (!proceed) return;
  }

  // 3. Fill the fillable PDF and trigger a download.
  const bytes = await fillTeamsheet(await fetchTemplate(), state);
  downloadPdf(bytes);
}

function getContainer(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Missing container element: #${id}`);
  }
  return el;
}

function init(): void {
  renderPlayerForm(getContainer("player-form"));
  renderImportButton(getContainer("import-button-container"));
  renderExportButton(getContainer("export-button-container"));
  renderTeam(state);
}

init();
