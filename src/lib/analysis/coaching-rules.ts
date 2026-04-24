import type { CanonicalJointName, PortableDrill } from "../schema/contracts.ts";
import type { PoseFrame } from "../upload/types.ts";
import type { ReplayAnalysisState } from "./replay-analysis-state.ts";
import type {
  CoachingBodyPartFinding,
  CoachingFeedbackOutput,
  CoachingFixStep,
  CoachingIssue,
  CoachingMentalModel,
  CoachingVisualGuide
} from "./coaching-feedback.ts";

type BuildRuleInput = {
  drill?: PortableDrill | null;
  frame?: PoseFrame;
  replayState?: ReplayAnalysisState;
};

type DrillCoachingProfile = {
  movementFamily?: "handstand" | "push_up" | "dip" | "squat" | "plank" | "pike_push_up" | "custom";
  rulesetId?: string;
  supportType?: "free" | "wall_assisted" | "floor" | "bars" | "custom";
  primaryGoal?: "balance" | "strength" | "mobility" | "control" | "custom";
  enabledVisualGuides?: Array<"stack_line" | "ghost_pose" | "highlight_region" | "correction_arrow" | "support_indicator" | "metric_badge">;
};

const REQUIRED_STACK_JOINTS: CanonicalJointName[] = ["leftWrist", "rightWrist", "leftHip", "rightHip", "leftAnkle", "rightAnkle"];

function averageX(frame: PoseFrame, joints: CanonicalJointName[]): number | null {
  const values = joints
    .map((joint) => frame.joints[joint])
    .filter((joint): joint is { x: number; y: number; confidence?: number } => Boolean(joint))
    .map((joint) => joint.x);
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function hasReliableJoint(frame: PoseFrame, joint: CanonicalJointName, min = 0.45): boolean {
  const value = frame.joints[joint];
  return Boolean(value && (value.confidence ?? 1) >= min);
}

function isLikelyHandstandSideHold(input: BuildRuleInput): boolean {
  const drill = input.drill;
  if (!drill) return false;
  const coachingProfile = (drill as PortableDrill & { coachingProfile?: DrillCoachingProfile }).coachingProfile;
  if (coachingProfile?.movementFamily) {
    return coachingProfile.movementFamily === "handstand";
  }
  // TODO: expose Coaching Profile settings in Drill Studio so rules can resolve from authored metadata (instead of title fallback).
  const title = `${drill.title ?? ""}`.toLowerCase();
  return title.includes("handstand") && drill.drillType === "hold" && drill.primaryView === "side";
}

export function resolveDrillSpecificCoaching(input: BuildRuleInput): Partial<CoachingFeedbackOutput> {
  if (!isLikelyHandstandSideHold(input) || !input.frame) {
    return {};
  }

  const frame = input.frame;
  const reliableCount = REQUIRED_STACK_JOINTS.filter((joint) => hasReliableJoint(frame, joint)).length;
  if (reliableCount < 4) {
    const visibilityIssue: CoachingIssue = {
      id: "handstand_visibility",
      title: "Need full body visibility",
      description: "Keep full body in frame to unlock body-line coaching.",
      severity: "info",
      category: "visibility",
      bodyRegion: "full_body",
      cueText: "Keep full body in frame to unlock body-line coaching.",
      visualGuides: [{ type: "highlight_region", label: "Full body in frame", severity: "info" }]
    };
    return { improvements: [visibilityIssue], primaryIssue: visibilityIssue, visualGuides: visibilityIssue.visualGuides };
  }

  const wristX = averageX(frame, ["leftWrist", "rightWrist"]);
  const hipX = averageX(frame, ["leftHip", "rightHip"]);
  const ankleX = averageX(frame, ["leftAnkle", "rightAnkle"]);

  if (wristX === null || hipX === null || ankleX === null) {
    return {};
  }

  const stackOffset = Math.abs(((hipX + ankleX) / 2) - wristX);
  const bananaShape = stackOffset > 0.08;

  const lineGuide: CoachingVisualGuide = {
    type: "stack_line",
    targetJoints: ["leftWrist", "rightWrist"],
    label: "Stack over hands",
    severity: bananaShape ? "warning" : "success"
  };

  const positives: CoachingIssue[] = [];
  if (input.replayState && input.replayState.maxHoldMs >= 1500) {
    positives.push({
      id: "handstand_hold_positive",
      title: "You can stay inverted",
      description: "You held long enough to work on line quality.",
      severity: "success",
      category: "stability",
      bodyRegion: "full_body",
      cueText: "Keep that calm hold while refining your shape.",
      visualGuides: [lineGuide]
    });
  }

  if (!bananaShape) {
    positives.push({
      id: "handstand_stack_positive",
      title: "Body line is close",
      description: "Your hips and feet are close to stacking over your hands.",
      severity: "success",
      category: "alignment",
      bodyRegion: "full_body",
      cueText: "Stay tall and keep this stacked line.",
      visualGuides: [lineGuide]
    });
    return { positives, visualGuides: [lineGuide] };
  }

  const primaryIssue: CoachingIssue = {
    id: "handstand_banana_shape",
    title: "Main limiter: banana shape",
    description: "Your hips and feet are not stacked over the hand base yet, so balance drifts to the wall side.",
    severity: "warning",
    category: "alignment",
    bodyRegion: "full_body",
    cueText: "Bring hips over hands until the wall feels unnecessary.",
    audioCue: "Stack hips over hands.",
    visualGuides: [
      lineGuide,
      {
        type: "correction_arrow",
        fromJoint: "leftHip",
        toJoint: "leftWrist",
        direction: "toward_line",
        label: "Hips over hands",
        severity: "warning"
      }
    ]
  };

  const bodyPartBreakdown: CoachingBodyPartFinding[] = [
    {
      bodyPart: "Shoulders",
      observation: "Shoulders need more elevation to maintain a tall line.",
      correction: "Push taller and bring shoulders to ears.",
      visualGuides: [{ type: "highlight_region", targetJoints: ["leftShoulder", "rightShoulder"], label: "Push tall", severity: "info" }]
    },
    {
      bodyPart: "Hips",
      observation: "Hips are drifting behind the hand stack line.",
      correction: "Shift hips over wrists before trying to float feet.",
      visualGuides: [{ type: "correction_arrow", fromJoint: "leftHip", toJoint: "leftWrist", direction: "toward_line", label: "Stack hips" }]
    }
  ];

  const mentalModel: CoachingMentalModel = {
    avoidThinking: "Lift my toes off the wall.",
    thinkInstead: "Bring hips over hands until the wall becomes unnecessary.",
    explanation: "Line first, then toe-light balance naturally follows."
  };

  const orderedFixSteps: CoachingFixStep[] = [
    { order: 1, title: "Push tall", instruction: "Elevate shoulders and lock elbows.", cueText: "Shoulders to ears.", visualGuides: [{ type: "highlight_region", targetJoints: ["leftShoulder", "rightShoulder"], label: "Push tall" }] },
    { order: 2, title: "Zip ribs", instruction: "Keep ribs stacked with pelvis.", cueText: "Zip ribs to hips.", visualGuides: [{ type: "highlight_region", label: "Ribs down" }] },
    { order: 3, title: "Squeeze glutes", instruction: "Reduce lower-back arch and keep line controlled.", cueText: "Glutes tight.", visualGuides: [{ type: "metric_badge", label: "Hollow body" }] }
  ];

  return {
    positives,
    primaryIssue,
    improvements: [primaryIssue],
    bodyPartBreakdown,
    mentalModel,
    orderedFixSteps,
    visualGuides: primaryIssue.visualGuides
  };
}
