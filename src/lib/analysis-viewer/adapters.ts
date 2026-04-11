import { formatDurationClock } from "../format/safe-duration.ts";
import type { AnalysisSessionRecord } from "../analysis/index.ts";
import type { LiveTimelineMarker, ReplayTerminalState } from "../live/results-summary.ts";
import { getReplayStateMessage, getReplayStateTone } from "../live/results-summary.ts";
import type { AnalysisViewerModel, AnalysisViewerDiagnosticsSection, ViewerSurface } from "./types";

function kindFromEventType(type: string): "rep" | "hold" | "phase" | "other" {
  if (type === "rep_complete") return "rep";
  if (type.startsWith("hold")) return "hold";
  if (type.startsWith("phase")) return "phase";
  return "other";
}

export function mapUploadAnalysisToViewerModel(input: {
  previewState: string;
  videoUrl: string | null;
  canShowVideo: boolean;
  surface: ViewerSurface;
  selectedEventId: string | null;
  summaryChips: AnalysisViewerModel["summaryChips"];
  downloads: AnalysisViewerModel["downloads"];
  diagnosticsSections: AnalysisViewerDiagnosticsSection[];
  warnings?: string[];
  recommendedDeliveryLabel?: string;
  session: AnalysisSessionRecord | null;
  durationMs?: number;
  mediaAspectRatio?: number;
  overlayFullscreenAction?: AnalysisViewerModel["overlayFullscreenAction"];
}): AnalysisViewerModel {
  const timelineEvents = (input.session?.events ?? []).map((event) => ({
    id: event.eventId,
    timestampMs: event.timestampMs,
    label: `${formatDurationClock(event.timestampMs)} · ${event.type}`,
    kind: kindFromEventType(event.type),
    seekable: true
  }));

  const state = input.previewState.includes("processing")
    ? "loading"
    : input.previewState.includes("failed")
      ? "warning"
      : input.videoUrl
        ? "ready"
        : "empty";

  return {
    state,
    stateTitle: state === "loading" ? "Generating annotated video" : state === "warning" ? "Annotated video unavailable" : undefined,
    stateDetail: state === "loading" ? "Raw preview is available while render completes." : undefined,
    videoUrl: input.videoUrl,
    mediaAspectRatio: input.mediaAspectRatio,
    canShowVideo: input.canShowVideo,
    surface: input.surface,
    surfaces: [
      { id: "annotated", label: "Annotated", available: input.surface === "annotated" || input.previewState !== "showing_raw_completed" },
      { id: "raw", label: "Raw", available: true }
    ],
    timelineDurationMs: input.durationMs,
    timelineEvents,
    selectedEventId: input.selectedEventId,
    summaryChips: input.summaryChips,
    downloads: input.downloads,
    diagnosticsSections: input.diagnosticsSections,
    overlayFullscreenAction: input.overlayFullscreenAction,
    recommendedDeliveryLabel: input.recommendedDeliveryLabel,
    warnings: input.warnings ?? []
  };
}

export function mapLiveAnalysisToViewerModel(input: {
  replayState: ReplayTerminalState;
  replayStageLabel: string | null;
  videoUrl: string | null;
  surface: ViewerSurface;
  selectedEventId: string | null;
  summaryChips: AnalysisViewerModel["summaryChips"];
  downloads: AnalysisViewerModel["downloads"];
  diagnosticsSections: AnalysisViewerDiagnosticsSection[];
  markers: LiveTimelineMarker[];
  durationMs: number;
  mediaAspectRatio?: number;
  warnings?: string[];
  recommendedDeliveryLabel?: string;
}): AnalysisViewerModel {
  const tone = getReplayStateTone(input.replayState);
  const state = input.replayState === "export-in-progress" ? "loading" : input.videoUrl ? "ready" : input.replayState === "export-failed" ? "error" : "warning";

  return {
    state,
    stateTitle: state === "loading" ? "Generating annotated video" : state === "error" ? "Replay unavailable" : undefined,
    stateDetail: input.replayState === "export-in-progress" ? input.replayStageLabel ?? "Processing export…" : undefined,
    videoUrl: input.videoUrl,
    mediaAspectRatio: input.mediaAspectRatio,
    canShowVideo: Boolean(input.videoUrl),
    surface: input.surface,
    surfaces: [
      { id: "annotated", label: "Annotated", available: Boolean(input.videoUrl) || input.surface === "annotated" },
      { id: "raw", label: "Raw", available: true }
    ],
    timelineDurationMs: input.durationMs,
    timelineEvents: input.markers.map((marker) => ({ ...marker, seekable: true })),
    selectedEventId: input.selectedEventId,
    summaryChips: [
      ...input.summaryChips,
      {
        id: "replay_state",
        label: "Replay",
        value: `${getReplayStateMessage(input.replayState)}${input.replayState === "export-in-progress" && input.replayStageLabel ? ` · ${input.replayStageLabel}` : ""}`,
        tone
      }
    ],
    downloads: input.downloads,
    diagnosticsSections: input.diagnosticsSections,
    recommendedDeliveryLabel: input.recommendedDeliveryLabel,
    warnings: input.warnings ?? []
  };
}
