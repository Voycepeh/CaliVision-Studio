export type ViewerSurface = "annotated" | "raw";

export type ViewerState = "empty" | "loading" | "warning" | "error" | "ready";

export type AnalysisViewerSummaryChip = {
  id: string;
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warning" | "danger";
};

export type AnalysisViewerEvent = {
  id: string;
  timestampMs: number;
  label: string;
  kind: "rep" | "hold" | "phase" | "other";
  seekable?: boolean;
};

export type AnalysisViewerDownload = {
  id: string;
  label: string;
  onDownload: () => void;
  disabled?: boolean;
  hint?: string;
};

export type AnalysisViewerDiagnosticsSection = {
  id: string;
  title: string;
  content: string[];
};

export type AnalysisViewerModel = {
  state: ViewerState;
  stateTitle?: string;
  stateDetail?: string;
  progress?: number;
  videoUrl: string | null;
  mediaAspectRatio?: number;
  canShowVideo: boolean;
  surface: ViewerSurface;
  surfaces: Array<{ id: ViewerSurface; label: string; available: boolean }>;
  timelineDurationMs?: number;
  timelineEvents: AnalysisViewerEvent[];
  selectedEventId: string | null;
  primarySummaryChips: AnalysisViewerSummaryChip[];
  technicalStatusChips: AnalysisViewerSummaryChip[];
  downloads: AnalysisViewerDownload[];
  diagnosticsSections: AnalysisViewerDiagnosticsSection[];
  overlayFullscreenAction?: { label: string; onToggle: () => void };
  recommendedDeliveryLabel?: string;
  warnings: string[];
};
