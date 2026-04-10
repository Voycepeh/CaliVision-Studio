import { CANONICAL_JOINT_NAMES } from "../pose/canonical.ts";
import { compareNormalizedJoints, winnerHasClearMargin } from "./pose-comparison.ts";
import type { CanonicalJointName, PortablePhase } from "../schema/contracts.ts";
import type { PoseFrame } from "../upload/types.ts";
import type { FramePhaseScore, ScorerOptions } from "./types.ts";
import type { DrillCameraView } from "./camera-view.ts";
import { getPoseAspectRatio, normalizePoseForScoring } from "./pose-normalization.ts";

const DEFAULT_MIN_SCORE_THRESHOLD = 0.35;
const DEFAULT_DISTANCE_TOLERANCE = 0.8;
const FRONT_VIEW_JOINTS: CanonicalJointName[] = CANONICAL_JOINT_NAMES;
const SIDE_LEFT_PROFILE_JOINTS: CanonicalJointName[] = [
  "nose",
  "leftShoulder",
  "leftElbow",
  "leftWrist",
  "leftHip",
  "leftKnee",
  "leftAnkle",
  "rightShoulder",
  "rightHip"
];
const SIDE_RIGHT_PROFILE_JOINTS: CanonicalJointName[] = [
  "nose",
  "rightShoulder",
  "rightElbow",
  "rightWrist",
  "rightHip",
  "rightKnee",
  "rightAnkle",
  "leftShoulder",
  "leftHip"
];

export function scoreFramesAgainstDrillPhases(
  sampledFrames: PoseFrame[],
  phases: PortablePhase[],
  options: ScorerOptions = {}
): FramePhaseScore[] {
  const minimumScoreThreshold = options.minimumScoreThreshold ?? DEFAULT_MIN_SCORE_THRESHOLD;
  const tolerance = options.defaultTolerance ?? DEFAULT_DISTANCE_TOLERANCE;

  return sampledFrames.map((frame) => {
    const perPhaseScores: Record<string, number> = {};
    const jointSubsetByPhaseId: Record<string, CanonicalJointName[]> = {};
    const phaseComparisons: NonNullable<FramePhaseScore["debug"]>["phaseComparisons"] = {};
    let bestPhaseId: string | null = null;
    let bestPhaseScore = 0;
    let secondBestPhaseScore = 0;
    const runtimeNormalized = normalizePoseForScoring(frame.joints, {
      cameraView: options.cameraView ?? "front",
      mirrored: frame.mirrored,
      aspectRatio: getPoseAspectRatio(frame)
    });

    for (const phase of phases) {
      const score = scoreFrameForPhase(frame, phase, tolerance, options.cameraView ?? "front", runtimeNormalized);
      perPhaseScores[phase.phaseId] = score.adjustedScore;
      jointSubsetByPhaseId[phase.phaseId] = score.jointSubset;
      phaseComparisons[phase.phaseId] = {
        templateNormalization: score.templateNormalization,
        perJointDelta: score.perJointDelta,
        rawScore: score.rawScore,
        adjustedScore: score.adjustedScore
      };
      if (score.adjustedScore > bestPhaseScore) {
        secondBestPhaseScore = bestPhaseScore;
        bestPhaseScore = score.adjustedScore;
        bestPhaseId = phase.phaseId;
      } else if (score.adjustedScore > secondBestPhaseScore) {
        secondBestPhaseScore = score.adjustedScore;
      }
    }

    const adjustedBestPhaseScore = applyWinnerMarginSoftPenalty(bestPhaseScore, secondBestPhaseScore);
    const chosenPhaseId = adjustedBestPhaseScore >= minimumScoreThreshold ? bestPhaseId : null;
    const phaseForQuality = phases.find((phase) => phase.phaseId === chosenPhaseId);
    const quality = buildQualityFlags(frame, phaseForQuality);

    return {
      timestampMs: frame.timestampMs,
      bestPhaseId: chosenPhaseId,
      bestPhaseScore: adjustedBestPhaseScore,
      perPhaseScores: options.includePerPhaseScores === false ? {} : perPhaseScores,
      debug: {
        cameraView: options.cameraView ?? "front",
        jointSubsetByPhaseId,
        mirrorApplied: runtimeNormalized.debug.mirrorApplied,
        runtimeNormalization: runtimeNormalized.debug,
        phaseComparisons
      },
      quality
    };
  });
}

function scoreFrameForPhase(
  frame: PoseFrame,
  phase: PortablePhase,
  tolerance: number,
  cameraView: DrillCameraView,
  runtimeNormalized: ReturnType<typeof normalizePoseForScoring>
): { adjustedScore: number; rawScore: number; perJointDelta: Partial<Record<CanonicalJointName, number>>; templateNormalization: NonNullable<FramePhaseScore["debug"]>["runtimeNormalization"]; jointSubset: CanonicalJointName[] } {
  if (phase.poseSequence.length === 0) {
    return {
      adjustedScore: 0,
      rawScore: 0,
      perJointDelta: {},
      templateNormalization: runtimeNormalized.debug,
      jointSubset: []
    };
  }

  // Baseline behavior: pick the best authored key pose match within the phase sequence.
  // TODO: evolve toward sequence-aware intra-phase progression scoring.
  let bestTemplateScore = 0;
  let bestRawTemplateScore = 0;
  let bestPerJointDelta: Partial<Record<CanonicalJointName, number>> = {};
  let bestTemplateNormalization = runtimeNormalized.debug;
  let bestJointSubset: CanonicalJointName[] = [];
  for (const template of phase.poseSequence) {
    const templateScore = scoreFrameForTemplate(frame, phase, template, tolerance, cameraView, runtimeNormalized);
    if (templateScore.adjustedScore > bestTemplateScore) {
      bestTemplateScore = templateScore.adjustedScore;
      bestRawTemplateScore = templateScore.rawScore;
      bestPerJointDelta = templateScore.perJointDelta;
      bestTemplateNormalization = templateScore.templateNormalization;
      bestJointSubset = templateScore.jointSubset;
    }
  }

  return {
    adjustedScore: bestTemplateScore,
    rawScore: bestRawTemplateScore,
    perJointDelta: bestPerJointDelta,
    templateNormalization: bestTemplateNormalization,
    jointSubset: bestJointSubset
  };
}

function scoreFrameForTemplate(
  frame: PoseFrame,
  phase: PortablePhase,
  template: NonNullable<PortablePhase["poseSequence"][number]>,
  tolerance: number,
  cameraView: DrillCameraView,
  runtimeNormalized: ReturnType<typeof normalizePoseForScoring>
): { adjustedScore: number; rawScore: number; perJointDelta: Partial<Record<CanonicalJointName, number>>; templateNormalization: NonNullable<FramePhaseScore["debug"]>["runtimeNormalization"]; jointSubset: CanonicalJointName[] } {
  const hintRequired = phase.analysis?.matchHints?.requiredJoints ?? [];
  const hintOptional = phase.analysis?.matchHints?.optionalJoints ?? [];
  const preferredJoints = hintRequired.length > 0 || hintOptional.length > 0
    ? Array.from(new Set([...hintRequired, ...hintOptional]))
    : null;

  if (!preferredJoints) {
    const defaultJointSets = getDefaultJointSetsForView(cameraView);
    let bestDefaultScore = 0;
    let bestRawScore = 0;
    let bestPerJointDelta: Partial<Record<CanonicalJointName, number>> = {};
    let bestTemplateNormalization = runtimeNormalized.debug;
    let bestJointSubset: CanonicalJointName[] = [];
    for (const jointSet of defaultJointSets) {
      const candidateScore = computeTemplateScoreForJointSet(frame, phase, template, tolerance, jointSet, hintRequired, runtimeNormalized);
      if (candidateScore.adjustedScore > bestDefaultScore) {
        bestDefaultScore = candidateScore.adjustedScore;
        bestRawScore = candidateScore.rawScore;
        bestPerJointDelta = candidateScore.perJointDelta;
        bestTemplateNormalization = candidateScore.templateNormalization;
        bestJointSubset = jointSet;
      }
    }
    return {
      adjustedScore: bestDefaultScore,
      rawScore: bestRawScore,
      perJointDelta: bestPerJointDelta,
      templateNormalization: bestTemplateNormalization,
      jointSubset: bestJointSubset
    };
  }

  const preferredScore = computeTemplateScoreForJointSet(frame, phase, template, tolerance, preferredJoints, hintRequired, runtimeNormalized);
  return { ...preferredScore, jointSubset: preferredJoints };
}

function computeTemplateScoreForJointSet(
  frame: PoseFrame,
  phase: PortablePhase,
  template: NonNullable<PortablePhase["poseSequence"][number]>,
  tolerance: number,
  preferredJoints: CanonicalJointName[],
  hintRequired: CanonicalJointName[],
  runtimeNormalized: ReturnType<typeof normalizePoseForScoring>
): { adjustedScore: number; rawScore: number; perJointDelta: Partial<Record<CanonicalJointName, number>>; templateNormalization: NonNullable<FramePhaseScore["debug"]>["runtimeNormalization"]; jointSubset: CanonicalJointName[] } {

  let confidenceWeightedScoreTotal = 0;
  let contributing = 0;
  let requiredMissing = 0;
  const templateNormalized = normalizePoseForScoring(template.joints, {
    cameraView: template.canvas?.view === "side" ? "side" : "front",
    mirrored: false,
    aspectRatio: getPoseAspectRatio(template)
  });
  const norm = 1;
  const perJointDelta: Partial<Record<CanonicalJointName, number>> = {};

  for (const jointName of preferredJoints) {
    const observed = runtimeNormalized.joints[jointName];
    const target = templateNormalized.joints[jointName];

    if (!observed || !target) {
      if (hintRequired.includes(jointName)) {
        requiredMissing += 1;
      }
      continue;
    }

    const distance = Math.hypot(observed.x - target.x, observed.y - target.y) / norm;
    perJointDelta[jointName] = distance;
    const distanceScore = clamp01(1 - distance / tolerance);
    const confidence = clamp01(observed.confidence ?? 1);
    confidenceWeightedScoreTotal += distanceScore * confidence;
    contributing += 1;
  }

  if (contributing === 0) {
    return {
      adjustedScore: 0,
      rawScore: 0,
      perJointDelta,
      templateNormalization: templateNormalized.debug,
      jointSubset: preferredJoints
    };
  }

  const confidenceByJoint = preferredJoints.reduce<Partial<Record<CanonicalJointName, number>>>((acc, jointName) => {
    const observedConfidence = runtimeNormalized.joints[jointName]?.confidence;
    if (Number.isFinite(observedConfidence)) {
      acc[jointName] = observedConfidence as number;
    }
    return acc;
  }, {});

  const metrics = compareNormalizedJoints(runtimeNormalized.joints, templateNormalized.joints, {
    jointNames: preferredJoints,
    normalizationDistance: norm,
    tolerance,
    confidenceByJoint
  });

  const missingPenalty = hintRequired.length === 0 ? 1 : clamp01(1 - requiredMissing / hintRequired.length);
  const confidenceScore = clamp01(confidenceWeightedScoreTotal / contributing);
  const discriminationPenalty = metrics.isMeaningfullyDissimilar
    ? metrics.dissimilarityScore * 0.2
    : metrics.dissimilarityScore * 0.12;
  const rawScore = clamp01((confidenceScore - discriminationPenalty) * missingPenalty);
  return {
    adjustedScore: rawScore,
    rawScore,
    perJointDelta,
    templateNormalization: templateNormalized.debug,
    jointSubset: preferredJoints
  };
}

function applyWinnerMarginSoftPenalty(bestPhaseScore: number, secondBestPhaseScore: number): number {
  if (winnerHasClearMargin(bestPhaseScore, secondBestPhaseScore)) {
    return bestPhaseScore;
  }
  if (bestPhaseScore <= 0) {
    return 0;
  }
  const proximity = clamp01(secondBestPhaseScore / bestPhaseScore);
  const marginPenalty = 0.02 + proximity * 0.04;
  return clamp01(bestPhaseScore - marginPenalty);
}

function getDefaultJointSetsForView(cameraView: DrillCameraView): CanonicalJointName[][] {
  if (cameraView === "side") {
    return [SIDE_LEFT_PROFILE_JOINTS, SIDE_RIGHT_PROFILE_JOINTS];
  }
  return [FRONT_VIEW_JOINTS];
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
