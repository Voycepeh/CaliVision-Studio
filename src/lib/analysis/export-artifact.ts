import type { AnalysisEvent, AnalysisSummaryMetrics, FramePhaseSample } from "../schema/contracts.ts";
import type { AnalysisSessionRecord } from "./session-repository.ts";

export const ANALYSIS_ARTIFACT_TYPE = "drill-analysis-session";
export const ANALYSIS_ARTIFACT_VERSION = "1.0.0";

export type AnalysisArtifactDerivedMedia = {
  annotatedReplay?: {
    status: "not-generated" | "generated";
    uri?: string;
    format?: string;
  };
};

export type AnalysisSessionArtifact = {
  artifactType: typeof ANALYSIS_ARTIFACT_TYPE;
  artifactVersion: typeof ANALYSIS_ARTIFACT_VERSION;
  exportedAt: string;
  session: {
    sessionId: string;
    status: AnalysisSessionRecord["status"];
    createdAtIso: string;
    completedAtIso?: string;
    drill: {
      drillId: string;
      drillTitle?: string;
      drillVersion?: string;
    };
  };
  summary: AnalysisSummaryMetrics;
  events: AnalysisEvent[];
  frameSamples: FramePhaseSample[];
  source: {
    sourceKind: AnalysisSessionRecord["sourceKind"];
    sourceId?: string;
    sourceLabel?: string;
    sourceUri?: string;
    rawVideoUri?: string;
    annotatedVideoUri?: string;
  };
  pipeline: {
    pipelineVersion?: string;
    scorerVersion?: string;
    analysisVersion?: string;
  };
  derivedMedia?: AnalysisArtifactDerivedMedia;
};

function stableSortEvents(events: AnalysisEvent[]): AnalysisEvent[] {
  return [...events].sort((a, b) => {
    if (a.timestampMs !== b.timestampMs) {
      return a.timestampMs - b.timestampMs;
    }
    return a.eventId.localeCompare(b.eventId);
  });
}

function detectFormatFromUri(uri: string): string | undefined {
  const normalized = uri.toLowerCase();
  if (normalized.endsWith(".mp4")) return "mp4";
  if (normalized.endsWith(".webm")) return "webm";
  return undefined;
}

function stableSortFrameSamples(frameSamples: FramePhaseSample[]): FramePhaseSample[] {
  return [...frameSamples].sort((a, b) => a.timestampMs - b.timestampMs);
}

export function createAnalysisSessionArtifact(
  session: AnalysisSessionRecord,
  options?: {
    exportedAt?: string;
  }
): AnalysisSessionArtifact {
  return {
    artifactType: ANALYSIS_ARTIFACT_TYPE,
    artifactVersion: ANALYSIS_ARTIFACT_VERSION,
    exportedAt: options?.exportedAt ?? new Date().toISOString(),
    session: {
      sessionId: session.sessionId,
      status: session.status,
      createdAtIso: session.createdAtIso,
      completedAtIso: session.completedAtIso,
      drill: {
        drillId: session.drillId,
        drillTitle: session.drillTitle,
        drillVersion: session.drillVersion
      }
    },
    summary: session.summary,
    events: stableSortEvents(session.events),
    frameSamples: stableSortFrameSamples(session.frameSamples),
    source: {
      sourceKind: session.sourceKind,
      sourceId: session.sourceId,
      sourceLabel: session.sourceLabel,
      sourceUri: session.sourceUri,
      rawVideoUri: session.rawVideoUri,
      annotatedVideoUri: session.annotatedVideoUri
    },
    pipeline: {
      pipelineVersion: session.pipelineVersion,
      scorerVersion: session.scorerVersion,
      analysisVersion: session.scorerVersion ?? session.pipelineVersion
    },
    derivedMedia: {
      annotatedReplay: session.annotatedVideoUri
        ? {
            status: "generated",
            uri: session.annotatedVideoUri,
            format: detectFormatFromUri(session.annotatedVideoUri) ?? "unknown"
          }
        : {
            status: "not-generated"
          }
    }
  };
}

export function serializeAnalysisSessionArtifact(session: AnalysisSessionRecord, options?: { exportedAt?: string }): string {
  return JSON.stringify(createAnalysisSessionArtifact(session, options), null, 2);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function deserializeAnalysisSessionArtifact(value: string): AnalysisSessionArtifact {
  const parsed = JSON.parse(value) as unknown;

  if (!isObject(parsed)) {
    throw new Error("Invalid analysis artifact payload.");
  }

  if (parsed.artifactType !== ANALYSIS_ARTIFACT_TYPE) {
    throw new Error("Unsupported analysis artifact type.");
  }

  if (parsed.artifactVersion !== ANALYSIS_ARTIFACT_VERSION) {
    throw new Error("Unsupported analysis artifact version.");
  }

  if (typeof parsed.exportedAt !== "string") {
    throw new Error("Invalid analysis artifact export timestamp.");
  }

  if (!isObject(parsed.session) || !isObject(parsed.session.drill)) {
    throw new Error("Invalid analysis artifact session payload.");
  }

  if (typeof parsed.session.sessionId !== "string" || typeof parsed.session.drill.drillId !== "string") {
    throw new Error("Invalid analysis artifact session identifiers.");
  }

  if (!Array.isArray(parsed.events) || !Array.isArray(parsed.frameSamples)) {
    throw new Error("Invalid analysis artifact timeline payload.");
  }

  if (!isObject(parsed.source) || !isObject(parsed.pipeline)) {
    throw new Error("Invalid analysis artifact metadata payload.");
  }

  return parsed as AnalysisSessionArtifact;
}

function sanitizeFilenamePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function toCompactTimestamp(iso: string): string {
  return iso.replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "_").replace("Z", "z");
}

export function createAnalysisArtifactFilename(session: AnalysisSessionRecord): string {
  const drillPart = sanitizeFilenamePart(session.drillTitle ?? session.drillId) || "drill";
  const sessionPart = sanitizeFilenamePart(session.sessionId) || "session";
  const timestampPart = toCompactTimestamp(session.createdAtIso);
  return `${drillPart}.${timestampPart}.${sessionPart}.analysis-artifact.json`;
}
