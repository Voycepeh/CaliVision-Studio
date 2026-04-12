import type { LiveSessionTrace } from "./types";

export type LiveTraceExportReadiness = {
  canAttemptAnnotatedExport: boolean;
  degradeToSparseExport: boolean;
  diagnostics: {
    sampleCount: number;
    uniqueTraceTimestamps: number;
    uniqueSourceTimestamps: number;
    advancingTraceSpanMs: number;
    advancingSourceSpanMs: number;
    renderableFrameCount: number;
  };
  failureReasons: string[];
  warnings: string[];
};

function toRoundedMs(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

export function assessLiveTraceExportReadiness(trace: Pick<LiveSessionTrace, "captures" | "video">): LiveTraceExportReadiness {
  const traceTimestamps = trace.captures.map((capture) => toRoundedMs(capture.timestampMs));
  const sourceTimestamps = trace.captures.map((capture) => toRoundedMs(capture.sourceMediaTimeMs ?? capture.timestampMs));

  const uniqueTraceTimestamps = new Set(traceTimestamps);
  const uniqueSourceTimestamps = new Set(sourceTimestamps);

  const minTraceTs = traceTimestamps.length > 0 ? Math.min(...traceTimestamps) : 0;
  const maxTraceTs = traceTimestamps.length > 0 ? Math.max(...traceTimestamps) : 0;
  const minSourceTs = sourceTimestamps.length > 0 ? Math.min(...sourceTimestamps) : 0;
  const maxSourceTs = sourceTimestamps.length > 0 ? Math.max(...sourceTimestamps) : 0;

  const diagnostics = {
    sampleCount: trace.captures.length,
    uniqueTraceTimestamps: uniqueTraceTimestamps.size,
    uniqueSourceTimestamps: uniqueSourceTimestamps.size,
    advancingTraceSpanMs: Math.max(0, maxTraceTs - minTraceTs),
    advancingSourceSpanMs: Math.max(0, maxSourceTs - minSourceTs),
    renderableFrameCount: uniqueTraceTimestamps.size
  };

  const failureReasons: string[] = [];
  const warnings: string[] = [];

  if (diagnostics.sampleCount < 2) {
    failureReasons.push(`sampleCount=${diagnostics.sampleCount} (<2)`);
  }
  if (diagnostics.uniqueTraceTimestamps < 2) {
    failureReasons.push(`uniqueTraceTimestamps=${diagnostics.uniqueTraceTimestamps} (<2)`);
  }
  if (diagnostics.advancingTraceSpanMs <= 0) {
    failureReasons.push(`advancingTraceSpanMs=${diagnostics.advancingTraceSpanMs} (must be >0)`);
  }

  if (diagnostics.uniqueSourceTimestamps < 3) {
    warnings.push(`source timestamps are sparse (${diagnostics.uniqueSourceTimestamps} unique)`);
  }
  if (diagnostics.advancingSourceSpanMs < Math.min(500, Math.max(1, toRoundedMs(trace.video.durationMs) - 1))) {
    warnings.push(`source time advancement is limited (${diagnostics.advancingSourceSpanMs}ms)`);
  }

  return {
    canAttemptAnnotatedExport: failureReasons.length === 0,
    degradeToSparseExport: warnings.length > 0,
    diagnostics,
    failureReasons,
    warnings
  };
}

export function formatLiveTraceExportDiagnostics(input: {
  diagnostics: LiveTraceExportReadiness["diagnostics"];
  failureReasons?: string[];
  warnings?: string[];
}): string {
  const base = [
    `samples=${input.diagnostics.sampleCount}`,
    `uniqueTraceTs=${input.diagnostics.uniqueTraceTimestamps}`,
    `uniqueSourceTs=${input.diagnostics.uniqueSourceTimestamps}`,
    `traceSpanMs=${input.diagnostics.advancingTraceSpanMs}`,
    `sourceSpanMs=${input.diagnostics.advancingSourceSpanMs}`,
    `renderableFrames=${input.diagnostics.renderableFrameCount}`
  ];

  if (input.failureReasons && input.failureReasons.length > 0) {
    base.push(`rejected=${input.failureReasons.join("; ")}`);
  }
  if (input.warnings && input.warnings.length > 0) {
    base.push(`warnings=${input.warnings.join("; ")}`);
  }

  return base.join(" | ");
}
