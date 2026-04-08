import type { AnalysisSessionRecord, AnalysisSessionStatus } from "../analysis/session-repository.ts";
import type { UploadJob } from "./types.ts";

export type UploadLifecycleState =
  | "ready_to_analyze"
  | "queued"
  | "analyzing"
  | "analysis_failed"
  | "analysis_cancelled"
  | "results_available"
  | "no_structured_result_yet";

export function getUploadLifecycleState(job: UploadJob, hasLinkedSession: boolean): UploadLifecycleState {
  if (job.status === "queued") {
    return job.progress > 0 ? "queued" : "ready_to_analyze";
  }
  if (job.status === "processing") {
    return "analyzing";
  }
  if (job.status === "completed") {
    return hasLinkedSession ? "results_available" : "no_structured_result_yet";
  }
  if (job.status === "failed") {
    return "analysis_failed";
  }
  return "analysis_cancelled";
}

export function getLifecycleLabel(state: UploadLifecycleState): string {
  switch (state) {
    case "ready_to_analyze":
      return "Ready to analyze";
    case "queued":
      return "Queued";
    case "analyzing":
      return "Analyzing";
    case "analysis_failed":
      return "Analysis failed";
    case "analysis_cancelled":
      return "Analysis cancelled";
    case "results_available":
      return "Results available";
    case "no_structured_result_yet":
      return "No structured result available yet";
    default:
      return "Unknown";
  }
}

export function getSessionOutcomeLabel(session: AnalysisSessionRecord): string {
  if (session.status === "failed") {
    return "Analysis failed";
  }
  if (session.status === "cancelled") {
    return "Analysis cancelled";
  }
  if (session.status === "pending") {
    return "Analysis in progress";
  }
  if (session.status === "partial") {
    return "Partial analysis";
  }

  if (session.frameSamples.length === 0 && session.events.length > 0) {
    return "Events captured, structured frame detail missing";
  }
  if (session.frameSamples.length > 0 && session.events.length === 0) {
    if (session.debug?.noEventCause === "no_confirmed_phase_transitions") {
      return "Structured frames available, no confirmed phase transitions";
    }
    if (session.debug?.noEventCause === "low_confidence_frames") {
      return "Structured frames available, confidence too low for stable phase confirmation";
    }
    if (session.debug?.noEventCause === "no_valid_smoothed_phases") {
      return "Structured frames available, temporal smoothing did not produce valid phases";
    }
    return "Structured frames available, event extraction produced no events";
  }
  if (!session.rawVideoUri) {
    return "Structured analysis available, source media URI missing";
  }

  return "Analysis completed";
}

export function getSessionStatusTone(status: AnalysisSessionStatus): "good" | "warn" | "bad" | "neutral" {
  if (status === "completed") return "good";
  if (status === "failed") return "bad";
  if (status === "partial") return "warn";
  return "neutral";
}

export function findLatestSessionForUpload(sessions: AnalysisSessionRecord[], sourceId?: string): AnalysisSessionRecord | null {
  if (!sourceId) {
    return null;
  }
  return sessions.find((session) => session.sourceId === sourceId) ?? null;
}

export function hasPlayableMediaSource(session: AnalysisSessionRecord): boolean {
  return Boolean(session.rawVideoUri || session.annotatedVideoUri);
}

export function hasMeaningfulAnalysisOutput(session: AnalysisSessionRecord): boolean {
  if (session.events.length > 0) {
    return true;
  }
  if (session.frameSamples.length > 0) {
    return true;
  }
  if ((session.summary.repCount ?? 0) > 0) {
    return true;
  }
  if ((session.summary.holdDurationMs ?? 0) > 0) {
    return true;
  }
  if ((session.summary.analyzedDurationMs ?? 0) > 0) {
    return true;
  }
  return false;
}

export function isReviewableSession(session: AnalysisSessionRecord): boolean {
  return hasPlayableMediaSource(session) || hasMeaningfulAnalysisOutput(session);
}

export function summarizeSessionAvailability(session: AnalysisSessionRecord): string[] {
  const notes: string[] = [];
  if (!session.rawVideoUri) {
    notes.push("Source media URI missing");
  }
  if (session.frameSamples.length === 0) {
    notes.push("Structured frame samples unavailable");
  }
  if (session.events.length === 0) {
    notes.push("Event log unavailable");
    if (session.debug?.noEventCause) {
      notes.push(`Cause: ${session.debug.noEventCause}`);
    }
    if (session.debug?.noEventDetails?.[0]) {
      notes.push(session.debug.noEventDetails[0]);
    }
  }
  return notes;
}
