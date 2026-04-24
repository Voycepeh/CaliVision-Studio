import type { CoachingVisualGuide } from "../analysis/coaching-feedback.ts";
import type { PoseFrame } from "./types.ts";

function resolveStackLineX(frame: PoseFrame | undefined, width: number, guide: CoachingVisualGuide): number {
  if (!frame) return width / 2;
  const joints = (guide.targetJoints?.length ? guide.targetJoints : ["leftWrist", "rightWrist"] as const)
    .map((jointName) => frame.joints[jointName])
    .filter((joint): joint is { x: number; y: number; confidence?: number } => Boolean(joint));
  if (joints.length === 0) return width / 2;
  return joints.map((joint) => joint.x * width).reduce((sum, value) => sum + value, 0) / joints.length;
}

export function resolveCoachingArrowEndpoint(input: {
  from: { x: number; y: number };
  guide: CoachingVisualGuide;
  frame?: PoseFrame;
  width: number;
}): { x: number; y: number } {
  if (input.guide.direction === "toward_line") {
    const stackX = resolveStackLineX(input.frame, input.width, input.guide);
    return { x: stackX, y: input.from.y };
  }
  const delta = input.guide.direction === "up"
    ? { x: 0, y: -36 }
    : input.guide.direction === "down"
      ? { x: 0, y: 36 }
      : input.guide.direction === "left"
        ? { x: -36, y: 0 }
        : { x: 36, y: 0 };
  return { x: input.from.x + delta.x, y: input.from.y + delta.y };
}
