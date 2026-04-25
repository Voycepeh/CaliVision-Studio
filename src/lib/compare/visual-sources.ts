import type { PoseFrame } from "@/lib/upload/types";

export type CompareVisualAvailability = {
  attemptHasVideo: boolean;
  attemptHasPoseReplay: boolean;
  benchmarkHasVideo: boolean;
  benchmarkHasPoseReplay: boolean;
};

export type CompareUsableVisualState = {
  hasUsableAttemptVisual: boolean;
  hasUsableBenchmarkVisual: boolean;
};

export function resolveCompareVisualAvailability(input: {
  attemptVideoUrl?: string;
  attemptPoseFrames?: PoseFrame[];
  benchmarkVideoUrl?: string;
  benchmarkPoseFrames?: PoseFrame[];
}): CompareVisualAvailability {
  return {
    attemptHasVideo: Boolean(input.attemptVideoUrl),
    attemptHasPoseReplay: Boolean(input.attemptPoseFrames?.length),
    benchmarkHasVideo: Boolean(input.benchmarkVideoUrl),
    benchmarkHasPoseReplay: Boolean(input.benchmarkPoseFrames?.length)
  };
}

export function resolveUsableCompareVisualState(input: {
  availability: CompareVisualAvailability;
  attemptVideoFailed?: boolean;
  benchmarkVideoFailed?: boolean;
}): CompareUsableVisualState {
  const showAttemptVideo = input.availability.attemptHasVideo && !input.attemptVideoFailed;
  const showBenchmarkVideo = input.availability.benchmarkHasVideo && !input.benchmarkVideoFailed;
  return {
    hasUsableAttemptVisual: showAttemptVideo || input.availability.attemptHasPoseReplay,
    hasUsableBenchmarkVisual: showBenchmarkVideo || input.availability.benchmarkHasPoseReplay
  };
}
