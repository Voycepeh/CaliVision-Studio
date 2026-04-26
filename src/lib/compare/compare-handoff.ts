import type { BenchmarkCoachingFeedback } from "@/lib/analysis/benchmark-feedback";
import type { CoachingFeedbackOutput } from "@/lib/analysis/coaching-feedback";
import type { AnalysisSessionRecord } from "@/lib/analysis/session-repository";
import type { PortableAssetRef, PortableDrill, PortablePose } from "@/lib/schema/contracts";
import type { PoseFrame } from "@/lib/upload/types";

const COMPARE_HANDOFF_STORAGE_KEY = "compare.workspace.handoff.v1";

export type CompareHandoffPayload = {
  source: "upload" | "live";
  fromPath: "/upload" | "/live";
  drill?: PortableDrill | null;
  drillAssets?: PortableAssetRef[];
  analysisSession?: AnalysisSessionRecord | null;
  benchmarkFeedback?: BenchmarkCoachingFeedback | null;
  coachingFeedback?: CoachingFeedbackOutput | null;
  attemptVideoUrl?: string;
  benchmarkVideoUrl?: string;
  attemptPoseFrames?: PoseFrame[];
  benchmarkPoses?: PortablePose[];
};

export function writeCompareHandoffPayload(payload: CompareHandoffPayload): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(COMPARE_HANDOFF_STORAGE_KEY, JSON.stringify(payload));
}

export function readCompareHandoffPayload(): CompareHandoffPayload | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(COMPARE_HANDOFF_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CompareHandoffPayload;
  } catch {
    return null;
  }
}
