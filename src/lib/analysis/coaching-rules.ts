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
import { filterVisualGuidesByProfile, type DrillCoachingProfile } from "./coaching-profile.ts";

type BuildRuleInput = {
  drill?: PortableDrill | null;
  frame?: PoseFrame;
  replayState?: ReplayAnalysisState;
};

type CoachingRulesetResolution = "handstand_wall_hold_v1" | "generic_hold_v1" | "generic_rep_v1" | "none" | null;

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

function getCoachingProfile(drill?: PortableDrill | null): DrillCoachingProfile | undefined {
  return drill?.coachingProfile;
}

function resolveRuleset(input: BuildRuleInput): CoachingRulesetResolution {
  const drill = input.drill;
  if (!drill) return null;
  const profile = getCoachingProfile(drill);

  if (profile?.rulesetId === "handstand_wall_hold_v1") {
    return "handstand_wall_hold_v1";
  }
  if (profile?.rulesetId === "generic_hold_v1") {
    return "generic_hold_v1";
  }
  if (profile?.rulesetId === "generic_rep_v1") {
    return "generic_rep_v1";
  }
  if (profile?.rulesetId === "none") {
    return "none";
  }

  const isAuthoredHandstandHold = profile?.movementFamily === "handstand" && drill.drillType === "hold" && drill.primaryView === "side";
  if (isAuthoredHandstandHold) {
    return "handstand_wall_hold_v1";
  }

  const title = `${drill.title ?? ""}`.toLowerCase();
  if (title.includes("handstand") && drill.drillType === "hold" && drill.primaryView === "side") {
    return "handstand_wall_hold_v1";
  }

  return null;
}

function applyVisualGuidePreferences(output: Partial<CoachingFeedbackOutput>, profile: DrillCoachingProfile | undefined): Partial<CoachingFeedbackOutput> {
  if (!profile?.enabledVisualGuides?.length) {
    return output;
  }

  const filterGuides = (guides: CoachingVisualGuide[] | undefined): CoachingVisualGuide[] | undefined => {
    if (!guides) return guides;
    return filterVisualGuidesByProfile(profile, guides);
  };

  const nextPositives = output.positives?.map((issue) => ({ ...issue, visualGuides: filterGuides(issue.visualGuides) ?? [] }));
  const nextImprovements = output.improvements?.map((issue) => ({ ...issue, visualGuides: filterGuides(issue.visualGuides) ?? [] }));

  return {
    ...output,
    positives: nextPositives,
    improvements: nextImprovements,
    primaryIssue: output.primaryIssue
      ? {
          ...output.primaryIssue,
          visualGuides: filterGuides(output.primaryIssue.visualGuides) ?? []
        }
      : undefined,
    bodyPartBreakdown: output.bodyPartBreakdown?.map((finding) => ({ ...finding, visualGuides: filterGuides(finding.visualGuides) ?? [] })),
    orderedFixSteps: output.orderedFixSteps?.map((step) => ({ ...step, visualGuides: filterGuides(step.visualGuides) ?? [] })),
    visualGuides: filterGuides(output.visualGuides) ?? []
  };
}

function buildHandstandWallHoldRule(input: BuildRuleInput): Partial<CoachingFeedbackOutput> {
  if (!input.frame) {
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

export function resolveDrillSpecificCoaching(input: BuildRuleInput): Partial<CoachingFeedbackOutput> {
  const ruleset = resolveRuleset(input);
  if (ruleset !== "handstand_wall_hold_v1") {
    return {};
  }

  return applyVisualGuidePreferences(buildHandstandWallHoldRule(input), getCoachingProfile(input.drill));
}
