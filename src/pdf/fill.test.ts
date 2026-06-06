// PDF fill round-trip tests: load real PDF, fill, reload, assert.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PDFDocument, PDFName } from "pdf-lib";
import { fillTeamsheet } from "./fill.js";
import { createEmptyState, emptyPokemon } from "../state.js";
import type { AppState } from "../types.js";

const templateBytes = readFileSync(
  resolve(process.cwd(), "public/play-pokemon-vg-team-list.fillable.pdf"),
);

function baseState(ageDivision: string): AppState {
  const state = createEmptyState();
  state.player.playerName = "Ash Ketchum";
  state.player.ageDivision = ageDivision;
  const mon = emptyPokemon();
  mon.displayName = "Incineroar";
  mon.lookupName = "Incineroar";
  mon.ability = "Intimidate";
  mon.computedStats = { hp: 200, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 };
  state.team[0] = mon;
  return state;
}

async function fillAndReload(state: AppState): Promise<PDFDocument> {
  const bytes = await fillTeamsheet(templateBytes, state);
  return PDFDocument.load(bytes);
}

describe("fillTeamsheet", () => {
  it("writes a page-1 name and ability that survive the round-trip", async () => {
    const doc = await fillAndReload(baseState("Masters"));
    const form = doc.getForm();
    expect(form.getTextField("p1_mon1_name").getText()).toBe("Incineroar");
    expect(form.getTextField("p1_mon1_ability").getText()).toBe("Intimidate");
    expect(form.getTextField("p1_player_name").getText()).toBe("Ash Ketchum");
    // Page 2 carries the name too.
    expect(form.getTextField("p2_mon1_name").getText()).toBe("Incineroar");
  });

  it("writes the computed stat with spa->spatk mapping", async () => {
    const doc = await fillAndReload(baseState("Masters"));
    const form = doc.getForm();
    expect(form.getTextField("p1_mon1_hp").getText()).toBe("200");
    expect(form.getTextField("p1_mon1_spatk").getText()).toBe("100");
  });

  function ageDivisionValue(doc: PDFDocument, fieldName: string): string | null {
    const acro = doc.getForm().getField(fieldName).acroField;
    const v = acro.dict.get(PDFName.of("V"));
    return v ? v.toString() : null;
  }

  it("selects /V = /0, /1, /2 for Juniors, Seniors, Masters", async () => {
    const cases: Array<[string, string]> = [
      ["Juniors", "/0"],
      ["Seniors", "/1"],
      ["Masters", "/2"],
    ];
    for (const [division, expected] of cases) {
      const doc = await fillAndReload(baseState(division));
      expect(ageDivisionValue(doc, "p1_age_division")).toBe(expected);
      expect(ageDivisionValue(doc, "p2_age_division")).toBe(expected);
    }
  });

  it("clears the age division /V when empty (template pre-selects Masters)", async () => {
    const doc = await fillAndReload(baseState(""));
    expect(ageDivisionValue(doc, "p1_age_division")).toBeNull();
    expect(ageDivisionValue(doc, "p2_age_division")).toBeNull();
  });

  it("does NOT flatten — form fields remain present after export", async () => {
    const doc = await fillAndReload(baseState("Masters"));
    const fields = doc.getForm().getFields();
    expect(fields.length).toBeGreaterThan(0);
    // The named fields are still individually addressable.
    expect(() => doc.getForm().getTextField("p1_mon1_name")).not.toThrow();
    expect(() => doc.getForm().getField("p1_age_division")).not.toThrow();
  });

  it("leaves an empty stat field blank (0 => '')", async () => {
    const state = baseState("Masters");
    state.team[0].computedStats.spe = 0;
    const doc = await fillAndReload(state);
    expect(doc.getForm().getTextField("p1_mon1_spe").getText()).toBeUndefined();
  });
});
