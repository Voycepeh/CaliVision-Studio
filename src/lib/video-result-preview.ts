export type ResultPreviewState = "processing_annotated" | "showing_raw" | "showing_annotated" | "annotated_failed";

export type ResolveResultPreviewStateInput = {
  isAnnotatedProcessing: boolean;
  hasAnnotatedAsset: boolean;
  hasRawAsset: boolean;
  annotatedFailed: boolean;
  showRawDuringProcessing: boolean;
  completedSelection?: "annotated" | "raw";
};

export function resolveResultPreviewState(input: ResolveResultPreviewStateInput): ResultPreviewState {
  if (input.annotatedFailed && input.hasRawAsset) {
    return "annotated_failed";
  }

  if (input.isAnnotatedProcessing && !input.hasAnnotatedAsset) {
    return input.showRawDuringProcessing && input.hasRawAsset ? "showing_raw" : "processing_annotated";
  }

  if (input.hasAnnotatedAsset) {
    if (input.completedSelection === "raw" && input.hasRawAsset) {
      return "showing_raw";
    }
    return "showing_annotated";
  }

  if (input.hasRawAsset) {
    return "showing_raw";
  }

  return "processing_annotated";
}
