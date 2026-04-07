import { CANONICAL_JOINT_NAMES } from "../pose/canonical.ts";
import type { PortablePhase } from "../schema/contracts.ts";
import type { PoseFrame } from "../upload/types.ts";
import type { FramePhaseScore, ScorerOptions } from "./types.ts";

const DEFAULT_MIN_SCORE_THRESHOLD = 0.35;
const DEFAULT_DISTANCE_TOLERANCE = 0.4;

export function scoreFramesAgainstDrillPhases(
  sampledFrames: PoseFrame[],
  phases: PortablePhase[],
  options: ScorerOptions = {}
): FramePhaseScore[] {
  const minimumScoreThreshold = options.minimumScoreThreshold ?? DEFAULT_MIN_SCORE_THRESHOLD;
  const tolerance = options.defaultTolerance ?? DEFAULT_DISTANCE_TOLERANCE;

  return sampledFrames.map((frame) => {
    const perPhaseScores: Record<string, number> = {};
    let bestPhaseId: string | null = null;
    let bestPhaseScore = 0;

    for (const phase of phases) {
      const score = scoreFrameForPhase(frame, phase, tolerance);
      perPhaseScores[phase.phaseId] = score;
      if (score > bestPhaseScore) {
        bestPhaseScore = score;
        bestPhaseId = phase.phaseId;
      }
    }

    const chosenPhaseId = bestPhaseScore >= minimumScoreThreshold ? bestPhaseId : null;
    const phaseForQuality = phases.find((phase) => phase.phaseId === chosenPhaseId);
    const quality = buildQualityFlags(frame, phaseForQuality);

    return {
      timestampMs: frame.timestampMs,
      bestPhaseId: chosenPhaseId,
      bestPhaseScore,
      perPhaseScores: options.includePerPhaseScores === false ? {} : perPhaseScores,
      quality
    };
  });
}

function scoreFrameForPhase(frame: PoseFrame, phase: PortablePhase, tolerance: number): number {
  if (phase.poseSequence.length === 0) {
    return 0;
  }

  // Baseline behavior: pick the best authored key pose match within the phase sequence.
  // TODO: evolve toward sequence-aware intra-phase progression scoring.
  let bestTemplateScore = 0;
  for (const template of phase.poseSequence) {
    const templateScore = scoreFrameForTemplate(frame, phase, template, tolerance);
    if (templateScore > bestTemplateScore) {
      bestTemplateScore = templateScore;
    }
  }

  return bestTemplateScore;
}

function scoreFrameForTemplate(
  frame: PoseFrame,
  phase: PortablePhase,
  template: NonNullable<PortablePhase["poseSequence"][number]>,
  tolerance: number
): number {
  const hintRequired = phase.analysis?.matchHints?.requiredJoints ?? [];
  const hintOptional = phase.analysis?.matchHints?.optionalJoints ?? [];
  const preferredJoints = hintRequired.length > 0 || hintOptional.length > 0
    ? Array.from(new Set([...hintRequired, ...hintOptional]))
    : CANONICAL_JOINT_NAMES;

  let scoreTotal = 0;
  let contributing = 0;
  let requiredMissing = 0;
  const norm = computeNormalizationDistance(frame, template);

  for (const jointName of preferredJoints) {
    const observed = frame.joints[jointName];
    const target = template.joints[jointName];

    if (!observed || !target) {
      if (hintRequired.includes(jointName)) {
        requiredMissing += 1;
      }
      continue;
    }

    const distance = Math.hypot(observed.x - target.x, observed.y - target.y) / norm;
    const distanceScore = clamp01(1 - distance / tolerance);
    const confidence = clamp01(observed.confidence ?? 1);
    scoreTotal += distanceScore * confidence;
    contributing += 1;
  }

  if (contributing === 0) {
    return 0;
  }

  const missingPenalty = hintRequired.length === 0 ? 1 : clamp01(1 - requiredMissing / hintRequired.length);
  return clamp01((scoreTotal / contributing) * missingPenalty);
}

function computeNormalizationDistance(frame: PoseFrame, template: NonNullable<PortablePhase["poseSequence"][number]>): number {
  const leftHip = frame.joints.leftHip ?? template.joints.leftHip;
  const rightHip = frame.joints.rightHip ?? template.joints.rightHip;
  const leftShoulder = frame.joints.leftShoulder ?? template.joints.leftShoulder;
  const rightShoulder = frame.joints.rightShoulder ?? template.joints.rightShoulder;

  const hipWidth = leftHip && rightHip ? Math.hypot(leftHip.x - rightHip.x, leftHip.y - rightHip.y) : 0;
  const shoulderWidth = leftShoulder && rightShoulder
    ? Math.hypot(leftShoulder.x - rightShoulder.x, leftShoulder.y - rightShoulder.y)
    : 0;

  return Math.max(0.2, hipWidth, shoulderWidth);
}

function buildQualityFlags(frame: PoseFrame, phase: PortablePhase | undefined) {
  const required = phase?.analysis?.matchHints?.requiredJoints ?? [];
  const optional = phase?.analysis?.matchHints?.optionalJoints ?? [];
  return {
    missingRequiredJoints: required.filter((joint) => !frame.joints[joint]),
    missingOptionalJoints: optional.filter((joint) => !frame.joints[joint]),
    usableJointCount: CANONICAL_JOINT_NAMES.filter((joint) => Boolean(frame.joints[joint])).length
  };
}

function clamp01(value: number): number {
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}
