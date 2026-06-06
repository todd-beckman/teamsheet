// Load the fillable PDF, set each AcroForm text field, save the bytes (PLAN §9.2).
//
// The fillable core (`fillTeamsheet`) is kept fetch-free so it can be exercised
// from node (read the PDF off disk, pass the bytes in). The browser entry point
// (`fetchTemplate`) handles loading the template from the Vite-served path.

import { PDFDocument, PDFName } from "pdf-lib";
import type { AppState } from "../types.js";
import { buildFieldValues } from "./fields.js";

// Age division is a 3-option button group whose widgets carry on-values "0",
// "1", "2" laid out left-to-right; on the sheet that is Juniors / Seniors /
// Masters. Map the selected division string to that index.
const AGE_DIVISION_ORDER = ["Juniors", "Seniors", "Masters"];

// Select one option of the multi-widget age-division button field: set the
// field value (/V) and each widget's appearance state (/AS). For an empty or
// unrecognized division the field is CLEARED (the blank template ships with an
// option pre-selected, so we must not leave a stale selection).
function selectAgeDivision(
  form: ReturnType<PDFDocument["getForm"]>,
  fieldName: string,
  division: string,
): void {
  const off = PDFName.of("Off");
  const index = AGE_DIVISION_ORDER.indexOf(division);
  const target = index >= 0 ? PDFName.of(String(index)) : null;

  const acro = form.getField(fieldName).acroField;
  if (target) acro.dict.set(PDFName.of("V"), target);
  else acro.dict.delete(PDFName.of("V"));

  for (const widget of acro.getWidgets()) {
    const on = widget.getOnValue();
    const selected =
      target != null && on != null && on.asString() === target.asString();
    widget.dict.set(PDFName.of("AS"), selected ? on : off);
  }
}

/**
 * Fill the fillable teamsheet PDF from app state and return the saved bytes.
 *
 * The form fields are left LIVE (we never flatten) so the user can keep editing
 * the exported PDF in any viewer. Each `setText` is wrapped so an unexpected or
 * missing field name can't abort the whole export.
 */
export async function fillTeamsheet(
  pdfBytes: ArrayBuffer | Uint8Array,
  state: AppState,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const form = doc.getForm();

  const values = buildFieldValues(state);
  for (const [name, value] of Object.entries(values)) {
    try {
      form.getTextField(name).setText(value);
    } catch (err) {
      // A bad/missing field name (or a name that isn't a text field) must not
      // abort the export — skip it and carry on.
      console.warn(`Skipping PDF field "${name}":`, err);
    }
  }

  // Age division is a button group on both pages, not a text field.
  for (const fieldName of ["p1_age_division", "p2_age_division"]) {
    try {
      selectAgeDivision(form, fieldName, state.player.ageDivision);
    } catch (err) {
      console.warn(`Skipping age division field "${fieldName}":`, err);
    }
  }

  // Render the set values so they appear before the viewer regenerates
  // appearances. If this needs an embedded font and throws, proceed without it.
  try {
    form.updateFieldAppearances();
  } catch (err) {
    console.warn("updateFieldAppearances failed; proceeding without it:", err);
  }

  return doc.save();
}

/**
 * Fetch the fillable PDF template from the Vite-served public path and return
 * its bytes. Browser-only (uses `fetch` and `import.meta.env.BASE_URL`).
 */
export async function fetchTemplate(): Promise<ArrayBuffer> {
  const url = `${import.meta.env.BASE_URL}play-pokemon-vg-team-list.fillable.pdf`;
  const response = await fetch(url);
  return response.arrayBuffer();
}
