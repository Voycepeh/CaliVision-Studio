export type PreviewSurface = "annotated" | "raw";

export type UnifiedResultPreviewState =
  | "idle"
  | "processing_annotated"
  | "showing_raw_during_processing"
  | "showing_annotated_completed"
  | "showing_raw_completed"
  | "annotated_failed_showing_raw";

export type ResolvePreviewStateInput = {
  hasRaw: boolean;
  hasAnnotated: boolean;
  isProcessingAnnotated: boolean;
  annotatedFailed: boolean;
  userRequestedRawDuringProcessing: boolean;
  preferredCompletedSurface?: PreviewSurface;
};

export function resolveUnifiedResultPreviewState(input: ResolvePreviewStateInput): UnifiedResultPreviewState {
  const {
    hasRaw,
    hasAnnotated,
    isProcessingAnnotated,
    annotatedFailed,
    userRequestedRawDuringProcessing,
    preferredCompletedSurface
  } = input;

  if (annotatedFailed) {
    return hasRaw ? "annotated_failed_showing_raw" : "idle";
  }

  if (isProcessingAnnotated) {
    if (userRequestedRawDuringProcessing && hasRaw) {
      return "showing_raw_during_processing";
    }
    return "processing_annotated";
  }

  if (hasAnnotated) {
    if (preferredCompletedSurface === "raw" && hasRaw) {
      return "showing_raw_completed";
    }
    return "showing_annotated_completed";
  }

  if (hasRaw) {
    return "showing_raw_completed";
  }

  return "idle";
}

export function canToggleCompletedPreview(input: { hasRaw: boolean; hasAnnotated: boolean; isProcessingAnnotated: boolean }): boolean {
  return !input.isProcessingAnnotated && input.hasRaw && input.hasAnnotated;
}

export function resolveAvailableDownloads(input: { hasRaw: boolean; hasAnnotated: boolean }): PreviewSurface[] {
  const actions: PreviewSurface[] = [];
  if (input.hasAnnotated) {
    actions.push("annotated");
  }
  if (input.hasRaw) {
    actions.push("raw");
  }
  return actions;
}
