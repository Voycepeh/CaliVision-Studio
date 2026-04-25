import type { PoseFrame } from "@/lib/upload/types";

export type CompareVisualAvailability = {
  attemptHasVideo: boolean;
  attemptHasPoseReplay: boolean;
  benchmarkHasVideo: boolean;
  benchmarkHasPoseReplay: boolean;
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
