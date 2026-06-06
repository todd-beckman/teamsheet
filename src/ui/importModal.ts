// Import modal (PLAN §8): a self-contained, dependency-light component that
// renders a backdrop + dialog with a Showdown <textarea>, Submit, and Cancel.
//
// Submit calls onSubmit(textarea.value) then closes. Cancel / backdrop click /
// Esc close WITHOUT calling onSubmit. The modal cleans up its DOM on close.
//
// Deliberately depends only on the DOM — it does NOT import the Showdown parser
// (that wiring lives in main.ts via the onSubmit callback, see the integration
// seam there).

export function openImportModal(onSubmit: (rawText: string) => void): void {
  const mount = document.getElementById("modal-root") ?? document.body;

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const dialog = document.createElement("div");
  dialog.className = "modal import-modal";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", "Import Showdown team");

  const heading = document.createElement("h2");
  heading.textContent = "Import Showdown Team";

  const hint = document.createElement("p");
  hint.className = "modal-hint";
  hint.textContent = "Paste your Pokémon Showdown team export below.";

  const textarea = document.createElement("textarea");
  textarea.className = "import-textarea";
  textarea.rows = 12;
  textarea.placeholder = "Incineroar @ Assault Vest\nAbility: Intimidate\n...";

  const buttonRow = document.createElement("div");
  buttonRow.className = "modal-buttons";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "btn btn-secondary";
  cancelButton.textContent = "Cancel";

  const submitButton = document.createElement("button");
  submitButton.type = "button";
  submitButton.className = "btn";
  submitButton.textContent = "Submit";

  buttonRow.append(cancelButton, submitButton);
  dialog.append(heading, hint, textarea, buttonRow);
  overlay.append(dialog);
  mount.append(overlay);

  // --- close / cleanup -----------------------------------------------------
  function close(): void {
    document.removeEventListener("keydown", onKeyDown);
    overlay.remove();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  function submit(): void {
    const rawText = textarea.value;
    close();
    onSubmit(rawText);
  }

  // Backdrop click (but not clicks inside the dialog) cancels.
  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay) {
      close();
    }
  });

  cancelButton.addEventListener("click", close);
  submitButton.addEventListener("click", submit);
  document.addEventListener("keydown", onKeyDown);

  textarea.focus();
}
