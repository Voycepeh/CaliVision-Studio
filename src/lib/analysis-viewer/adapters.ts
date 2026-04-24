import { formatDurationClock } from "../format/safe-duration.ts";
import type { AnalysisSessionRecord } from "../analysis/index.ts";
import type { LiveTimelineMarker, ReplayTerminalState } from "../live/results-summary.ts";
import { getReplayStateMessage, getReplayStateTone } from "../live/results-summary.ts";
import type { AnalysisViewerModel, AnalysisViewerDiagnosticsSection, ViewerSurface } from "./types";
import { formatAnnotatedRenderProgressLabel } from "./progress-status.ts";

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
  hasRaw: boolean;
  hasAnnotated: boolean;
  primarySummaryChips: AnalysisViewerModel["primarySummaryChips"];
  technicalStatusChips?: AnalysisViewerModel["technicalStatusChips"];
  downloads: AnalysisViewerModel["downloads"];
  diagnosticsSections: AnalysisViewerDiagnosticsSection[];
  panel: AnalysisViewerModel["panel"];
  warnings?: string[];
  recommendedDeliveryLabel?: string;
  session: AnalysisSessionRecord | null;
  processingStageLabel?: string | null;
  replayStateLabel?: string;
  replayTone?: "neutral" | "success" | "warning" | "danger";
  durationMs?: number;
  mediaAspectRatio?: number;
  overlayFullscreenAction?: AnalysisViewerModel["overlayFullscreenAction"];
}): AnalysisViewerModel {
  const timelineEvents = (input.session?.events ?? []).map((event) => ({
    id: event.eventId,
    timestampMs: event.timestampMs,
    label: `${formatDurationClock(event.timestampMs)} · ${event.type}`,
    kind: kindFromEventType(event.type),
    eventType: event.type,
    phaseId: event.phaseId,
    ...(typeof event.details?.exitReason === "string" ? { exitReason: event.details.exitReason } : {}),
    seekable: true
  }));

  const state = input.previewState.includes("processing")
    ? "loading"
    : input.previewState.includes("failed")
      ? "warning"
      : input.videoUrl
        ? "ready"
        : "empty";

  const isProcessing = input.previewState.includes("processing");
  const rawExplicitDuringProcessing = input.previewState === "showing_raw_during_processing";

  const annotatedAvailability = isProcessing
    ? "processing"
    : input.hasAnnotated
      ? "ready"
      : "unavailable";
  const rawAvailability = input.hasRaw && (!isProcessing || rawExplicitDuringProcessing)
    ? "ready"
    : "unavailable";
  const replayChip = input.replayStateLabel
    ? [{
        id: "replay_state",
        label: "Replay",
        value: input.replayStateLabel,
        tone: input.replayTone
      }]
    : [];

  return {
    state,
    stateTitle: state === "loading" ? "Generating annotated video" : state === "warning" ? "Annotated video unavailable" : undefined,
    stateDetail:
      state === "loading"
        ? (formatAnnotatedRenderProgressLabel({ stageLabel: input.processingStageLabel ?? "Raw preview is available while render completes.", completed: false })
          ?? "Raw preview is available while render completes.")
        : undefined,
    videoUrl: input.videoUrl,
    mediaAspectRatio: input.mediaAspectRatio,
    canShowVideo: state === "ready" && input.canShowVideo,
    surface: input.surface,
    surfaces: [
      {
        id: "annotated",
        label: "Annotated",
        availability: annotatedAvailability,
        description: annotatedAvailability === "processing" ? "Rendering…" : annotatedAvailability === "unavailable" ? "Unavailable" : undefined
      },
      {
        id: "raw",
        label: "Raw",
        availability: rawAvailability,
        description: rawAvailability === "unavailable" ? "Unavailable" : undefined
      }
    ],
    timelineDurationMs: input.durationMs,
    timelineEvents,
    primarySummaryChips: input.primarySummaryChips,
    technicalStatusChips: [...(input.technicalStatusChips ?? []), ...replayChip],
    downloads: input.downloads,
    diagnosticsSections: input.diagnosticsSections,
    panel: input.panel,
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
  primarySummaryChips: AnalysisViewerModel["primarySummaryChips"];
  technicalStatusChips?: AnalysisViewerModel["technicalStatusChips"];
  downloads: AnalysisViewerModel["downloads"];
  diagnosticsSections: AnalysisViewerDiagnosticsSection[];
  panel: AnalysisViewerModel["panel"];
  markers: LiveTimelineMarker[];
  durationMs: number;
  mediaAspectRatio?: number;
  hasAnnotatedReady?: boolean;
  warnings?: string[];
  recommendedDeliveryLabel?: string;
}): AnalysisViewerModel {
  const tone = getReplayStateTone(input.replayState);
  const state = input.replayState === "export-in-progress" ? "loading" : input.videoUrl ? "ready" : input.replayState === "export-failed" ? "error" : "warning";
  const annotatedAvailability = input.replayState === "export-in-progress" ? "processing" : input.hasAnnotatedReady ? "ready" : "unavailable";
  const rawAvailability = input.replayState === "export-in-progress" ? "processing" : state === "ready" && Boolean(input.videoUrl) ? "ready" : "unavailable";

  return {
    state,
    stateTitle: state === "loading" ? "Generating annotated video" : state === "error" ? "Replay unavailable" : undefined,
    stateDetail: input.replayState === "export-in-progress" ? input.replayStageLabel ?? "Processing export…" : undefined,
    videoUrl: input.videoUrl,
    mediaAspectRatio: input.mediaAspectRatio,
    canShowVideo: state === "ready" && Boolean(input.videoUrl),
    surface: input.surface,
    surfaces: [
      {
        id: "annotated",
        label: "Annotated",
        availability: annotatedAvailability,
        description: annotatedAvailability === "processing" ? "Rendering…" : annotatedAvailability === "unavailable" ? "Unavailable" : undefined
      },
      {
        id: "raw",
        label: "Raw",
        availability: rawAvailability,
        description: rawAvailability === "processing" ? "Processing…" : rawAvailability === "unavailable" ? "Unavailable" : undefined
      }
    ],
    timelineDurationMs: input.durationMs,
    timelineEvents: input.markers.map((marker) => ({ ...marker, seekable: true })),
    primarySummaryChips: input.primarySummaryChips,
    technicalStatusChips: [
      ...(input.technicalStatusChips ?? []),
      {
        id: "replay_state",
        label: "Replay",
        value: `${getReplayStateMessage(input.replayState)}${input.replayState === "export-in-progress" && input.replayStageLabel ? ` · ${input.replayStageLabel}` : ""}`,
        tone
      }
    ],
    downloads: input.downloads,
    diagnosticsSections: input.diagnosticsSections,
    panel: input.panel,
    recommendedDeliveryLabel: input.recommendedDeliveryLabel,
    warnings: input.warnings ?? []
  };
}
