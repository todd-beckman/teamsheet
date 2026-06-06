// Trigger a browser download of the generated PDF bytes.

/**
 * Download `bytes` as a PDF file via a temporary object URL + `<a download>`.
 * The object URL is revoked immediately after the synthetic click.
 */
export function downloadPdf(bytes: Uint8Array, filename = "teamsheet.pdf"): void {
  // Copy into a fresh, plain ArrayBuffer-backed view so it satisfies BlobPart
  // (pdf-lib's bytes are typed as the generic `Uint8Array<ArrayBufferLike>`).
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
}
