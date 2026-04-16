export type ResultDownloadTarget = "annotated" | "raw" | "processing_summary" | "pose_timeline";

export function resolveResultDownloadTargets(input: {
  resultType?: "upload" | "live";
  hasAnnotatedVideo: boolean;
  hasRawVideo: boolean;
  hasProcessingSummary: boolean;
  hasPoseTimeline: boolean;
}): ResultDownloadTarget[] {
  const targets: ResultDownloadTarget[] = [];
  if (input.hasAnnotatedVideo) {
    targets.push("annotated");
  }
  if (input.hasRawVideo) {
    targets.push("raw");
  }
  if (input.hasProcessingSummary) {
    targets.push("processing_summary");
  }
  if (input.hasPoseTimeline) {
    targets.push("pose_timeline");
  }
  return targets;
}
