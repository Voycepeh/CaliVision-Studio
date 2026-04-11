export function resolveLiveDownloadLabel(options: { kind: "raw" | "annotated"; downloadable?: boolean }): string {
  if (options.downloadable !== false) {
    return options.kind === "annotated" ? "Download annotated" : "Download raw";
  }
  return options.kind === "annotated" ? "Download annotated WebM (may not play)" : "Download raw WebM (may not play)";
}

export function resolveUploadDownloadLabel(options: { kind: "raw" | "annotated"; downloadable?: boolean }): string {
  if (options.downloadable !== false) {
    return options.kind === "annotated" ? "Download Annotated Video" : "Download Raw Video";
  }
  return options.kind === "annotated"
    ? "Download Annotated WebM (may not play on this device)"
    : "Download Raw WebM (may not play on this device)";
}
