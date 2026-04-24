import { CANONICAL_JOINT_NAMES } from "../pose/canonical.ts";
import { compareNormalizedJoints, winnerHasClearMargin } from "./pose-comparison.ts";
import type { CanonicalJointName, PortablePhase } from "../schema/contracts.ts";
import type { PoseFrame } from "../upload/types.ts";
import type { FramePhaseScore, ScorerOptions } from "./types.ts";
import type { DrillCameraView } from "./camera-view.ts";
import { getPoseAspectRatio, normalizePoseForScoring } from "./pose-normalization.ts";

const DEFAULT_MIN_SCORE_THRESHOLD = 0.35;
const DEFAULT_HOLD_MIN_SCORE_THRESHOLD = 0.55;
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
const LEFT_RIGHT_JOINT_PAIRS: Array<[CanonicalJointName, CanonicalJointName]> = [
  ["leftShoulder", "rightShoulder"],
  ["leftElbow", "rightElbow"],
  ["leftWrist", "rightWrist"],
  ["leftHip", "rightHip"],
  ["leftKnee", "rightKnee"],
  ["leftAnkle", "rightAnkle"]
];

type RuntimePoseCandidate = {
  orientationMode: "native" | "mirrored";
  normalizedPose: ReturnType<typeof normalizePoseForScoring>;
};

export function scoreFramesAgainstDrillPhases(
  sampledFrames: PoseFrame[],
  phases: PortablePhase[],
  options: ScorerOptions = {}
): FramePhaseScore[] {
  const minimumScoreThreshold = options.minimumScoreThreshold ?? DEFAULT_MIN_SCORE_THRESHOLD;
  const holdMinimumScoreThreshold = options.holdMinimumScoreThreshold ?? DEFAULT_HOLD_MIN_SCORE_THRESHOLD;
  const tolerance = options.defaultTolerance ?? DEFAULT_DISTANCE_TOLERANCE;

  return sampledFrames.map((frame) => {
    const perPhaseScores: Record<string, number> = {};
    const jointSubsetByPhaseId: Record<string, CanonicalJointName[]> = {};
    const sideOrientationModeByPhaseId: Record<string, "native" | "mirrored"> = {};
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
        adjustedScore: score.adjustedScore,
        orientationMode: score.orientationMode,
        nativeAdjustedScore: score.nativeAdjustedScore,
        mirroredAdjustedScore: score.mirroredAdjustedScore
      };
      if (score.orientationMode) {
        sideOrientationModeByPhaseId[phase.phaseId] = score.orientationMode;
      }
      if (score.adjustedScore > bestPhaseScore) {
        secondBestPhaseScore = bestPhaseScore;
        bestPhaseScore = score.adjustedScore;
        bestPhaseId = phase.phaseId;
      } else if (score.adjustedScore > secondBestPhaseScore) {
        secondBestPhaseScore = score.adjustedScore;
      }
    }

    const adjustedBestPhaseScore = applyWinnerMarginSoftPenalty(bestPhaseScore, secondBestPhaseScore);
    let chosenPhaseId = adjustedBestPhaseScore >= minimumScoreThreshold ? bestPhaseId : null;
    let holdGateDebug: NonNullable<FramePhaseScore["debug"]>["holdGate"] | undefined = undefined;
    if (chosenPhaseId && options.holdTargetPhaseId && chosenPhaseId === options.holdTargetPhaseId) {
      const holdGate = evaluateHoldTargetGate({
        frame,
        phase: phases.find((item) => item.phaseId === options.holdTargetPhaseId) ?? null,
        score: adjustedBestPhaseScore,
        threshold: holdMinimumScoreThreshold
      });
      holdGateDebug = {
        targetPhaseId: options.holdTargetPhaseId,
        passed: holdGate.passed,
        threshold: holdMinimumScoreThreshold,
        score: adjustedBestPhaseScore,
        reason: holdGate.reason
      };
      if (!holdGate.passed) {
        chosenPhaseId = null;
      }
    }
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
        sideOrientationModeByPhaseId: Object.keys(sideOrientationModeByPhaseId).length > 0 ? sideOrientationModeByPhaseId : undefined,
        phaseComparisons,
        ...(holdGateDebug ? { holdGate: holdGateDebug } : {})
      },
      quality
    };
  });
}

function evaluateHoldTargetGate(input: {
  frame: PoseFrame;
  phase: PortablePhase | null;
  score: number;
  threshold: number;
}): { passed: boolean; reason?: "low_match_score" | "wrist_below_shoulder" | "elbow_below_shoulder" | "insufficient_confidence" } {
  if (input.score < input.threshold) {
    return { passed: false, reason: "low_match_score" };
  }
  const template = input.phase?.poseSequence?.[0];
  if (!template) {
    return { passed: true };
  }

  const authoredWristsRaised =
    (template.joints.leftWrist && template.joints.leftShoulder && template.joints.leftWrist.y <= template.joints.leftShoulder.y)
    || (template.joints.rightWrist && template.joints.rightShoulder && template.joints.rightWrist.y <= template.joints.rightShoulder.y);
  if (!authoredWristsRaised) {
    return { passed: true };
  }

  const leftShoulder = input.frame.joints.leftShoulder;
  const rightShoulder = input.frame.joints.rightShoulder;
  const leftWrist = input.frame.joints.leftWrist;
  const rightWrist = input.frame.joints.rightWrist;
  const leftElbow = input.frame.joints.leftElbow;
  const rightElbow = input.frame.joints.rightElbow;

  const confidenceTriplets: Array<[typeof leftWrist | undefined, typeof leftShoulder | undefined, typeof leftElbow | undefined]> = [
    [leftWrist, leftShoulder, leftElbow],
    [rightWrist, rightShoulder, rightElbow]
  ];
  const lowConfidenceSide = confidenceTriplets.some(([wrist, shoulder, elbow]) => {
    const values = [wrist?.confidence ?? 1, shoulder?.confidence ?? 1, elbow?.confidence ?? 1];
    return values.some((value) => typeof value === "number" && value < 0.2);
  });
  if (lowConfidenceSide) {
    return { passed: false, reason: "insufficient_confidence" };
  }

  const wristBelowShoulder = confidenceTriplets.some(([wrist, shoulder]) => wrist && shoulder && wrist.y > shoulder.y + 0.02);
  if (wristBelowShoulder) {
    return { passed: false, reason: "wrist_below_shoulder" };
  }
  const elbowClearlyBelowShoulder = confidenceTriplets.some(([, shoulder, elbow]) => elbow && shoulder && elbow.y > shoulder.y + 0.08);
  if (elbowClearlyBelowShoulder) {
    return { passed: false, reason: "elbow_below_shoulder" };
  }

  return { passed: true };
}

function scoreFrameForPhase(
  frame: PoseFrame,
  phase: PortablePhase,
  tolerance: number,
  cameraView: DrillCameraView,
  runtimeNormalized: ReturnType<typeof normalizePoseForScoring>
): { adjustedScore: number; rawScore: number; perJointDelta: Partial<Record<CanonicalJointName, number>>; templateNormalization: NonNullable<FramePhaseScore["debug"]>["runtimeNormalization"]; jointSubset: CanonicalJointName[]; orientationMode?: "native" | "mirrored"; nativeAdjustedScore?: number; mirroredAdjustedScore?: number } {
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
  let bestOrientationMode: "native" | "mirrored" | undefined;
  let bestNativeAdjustedScore: number | undefined;
  let bestMirroredAdjustedScore: number | undefined;
  for (const template of phase.poseSequence) {
    const templateScore = scoreFrameForTemplate(frame, phase, template, tolerance, cameraView, runtimeNormalized);
    if (templateScore.adjustedScore > bestTemplateScore) {
      bestTemplateScore = templateScore.adjustedScore;
      bestRawTemplateScore = templateScore.rawScore;
      bestPerJointDelta = templateScore.perJointDelta;
      bestTemplateNormalization = templateScore.templateNormalization;
      bestJointSubset = templateScore.jointSubset;
      bestOrientationMode = templateScore.orientationMode;
      bestNativeAdjustedScore = templateScore.nativeAdjustedScore;
      bestMirroredAdjustedScore = templateScore.mirroredAdjustedScore;
    }
  }

  return {
    adjustedScore: bestTemplateScore,
    rawScore: bestRawTemplateScore,
    perJointDelta: bestPerJointDelta,
    templateNormalization: bestTemplateNormalization,
    jointSubset: bestJointSubset,
    orientationMode: bestOrientationMode,
    nativeAdjustedScore: bestNativeAdjustedScore,
    mirroredAdjustedScore: bestMirroredAdjustedScore
  };
}

function scoreFrameForTemplate(
  frame: PoseFrame,
  phase: PortablePhase,
  template: NonNullable<PortablePhase["poseSequence"][number]>,
  tolerance: number,
  cameraView: DrillCameraView,
  runtimeNormalized: ReturnType<typeof normalizePoseForScoring>
): { adjustedScore: number; rawScore: number; perJointDelta: Partial<Record<CanonicalJointName, number>>; templateNormalization: NonNullable<FramePhaseScore["debug"]>["runtimeNormalization"]; jointSubset: CanonicalJointName[]; orientationMode?: "native" | "mirrored"; nativeAdjustedScore?: number; mirroredAdjustedScore?: number } {
  const candidateRuntimePoses = createRuntimePoseCandidates(runtimeNormalized, cameraView);
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
    let bestOrientationMode: "native" | "mirrored" | undefined;
    let bestNativeAdjustedScore: number | undefined;
    let bestMirroredAdjustedScore: number | undefined;
    for (const jointSet of defaultJointSets) {
      const candidateScore = computeBestTemplateScoreForJointSet(
        frame,
        phase,
        template,
        tolerance,
        jointSet,
        hintRequired,
        candidateRuntimePoses
      );
      if (candidateScore.adjustedScore > bestDefaultScore) {
        bestDefaultScore = candidateScore.adjustedScore;
        bestRawScore = candidateScore.rawScore;
        bestPerJointDelta = candidateScore.perJointDelta;
        bestTemplateNormalization = candidateScore.templateNormalization;
        bestJointSubset = jointSet;
        bestOrientationMode = candidateScore.orientationMode;
        bestNativeAdjustedScore = candidateScore.nativeAdjustedScore;
        bestMirroredAdjustedScore = candidateScore.mirroredAdjustedScore;
      }
    }
    return {
      adjustedScore: bestDefaultScore,
      rawScore: bestRawScore,
      perJointDelta: bestPerJointDelta,
      templateNormalization: bestTemplateNormalization,
      jointSubset: bestJointSubset,
      orientationMode: bestOrientationMode,
      nativeAdjustedScore: bestNativeAdjustedScore,
      mirroredAdjustedScore: bestMirroredAdjustedScore
    };
  }

  const preferredScore = computeBestTemplateScoreForJointSet(
    frame,
    phase,
    template,
    tolerance,
    preferredJoints,
    hintRequired,
    candidateRuntimePoses
  );
  return { ...preferredScore, jointSubset: preferredJoints };
}

function computeBestTemplateScoreForJointSet(
  frame: PoseFrame,
  phase: PortablePhase,
  template: NonNullable<PortablePhase["poseSequence"][number]>,
  tolerance: number,
  preferredJoints: CanonicalJointName[],
  hintRequired: CanonicalJointName[],
  candidates: RuntimePoseCandidate[]
): { adjustedScore: number; rawScore: number; perJointDelta: Partial<Record<CanonicalJointName, number>>; templateNormalization: NonNullable<FramePhaseScore["debug"]>["runtimeNormalization"]; jointSubset: CanonicalJointName[]; orientationMode?: "native" | "mirrored"; nativeAdjustedScore?: number; mirroredAdjustedScore?: number } {
  let best: ReturnType<typeof computeTemplateScoreForJointSet> | null = null;
  let nativeAdjustedScore: number | undefined;
  let mirroredAdjustedScore: number | undefined;

  for (const candidate of candidates) {
    const score = computeTemplateScoreForJointSet(frame, phase, template, tolerance, preferredJoints, hintRequired, candidate.normalizedPose);
    if (candidate.orientationMode === "native") {
      nativeAdjustedScore = score.adjustedScore;
    } else {
      mirroredAdjustedScore = score.adjustedScore;
    }
    if (!best || score.adjustedScore > best.adjustedScore) {
      best = { ...score, orientationMode: candidate.orientationMode };
    }
  }

  if (!best) {
    return {
      adjustedScore: 0,
      rawScore: 0,
      perJointDelta: {},
      templateNormalization: candidates[0]?.normalizedPose.debug ?? normalizePoseForScoring({}, { cameraView: "front" }).debug,
      jointSubset: preferredJoints
    };
  }

  return {
    ...best,
    nativeAdjustedScore,
    mirroredAdjustedScore
  };
}

function createRuntimePoseCandidates(
  runtimeNormalized: ReturnType<typeof normalizePoseForScoring>,
  cameraView: DrillCameraView
): RuntimePoseCandidate[] {
  if (cameraView !== "side") {
    return [{ orientationMode: "native", normalizedPose: runtimeNormalized }];
  }
  return [
    { orientationMode: "native", normalizedPose: runtimeNormalized },
    // Normalize side poses so authored side semantics match left-facing and right-facing executions.
    { orientationMode: "mirrored", normalizedPose: mirrorSideRuntimePose(runtimeNormalized) }
  ];
}

function computeTemplateScoreForJointSet(
  frame: PoseFrame,
  phase: PortablePhase,
  template: NonNullable<PortablePhase["poseSequence"][number]>,
  tolerance: number,
  preferredJoints: CanonicalJointName[],
  hintRequired: CanonicalJointName[],
  runtimeNormalized: ReturnType<typeof normalizePoseForScoring>
): { adjustedScore: number; rawScore: number; perJointDelta: Partial<Record<CanonicalJointName, number>>; templateNormalization: NonNullable<FramePhaseScore["debug"]>["runtimeNormalization"]; jointSubset: CanonicalJointName[]; orientationMode?: "native" | "mirrored" } {

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

function mirrorSideRuntimePose(runtimeNormalized: ReturnType<typeof normalizePoseForScoring>): ReturnType<typeof normalizePoseForScoring> {
  const mirrored = Object.entries(runtimeNormalized.joints).reduce<typeof runtimeNormalized.joints>((acc, [jointName, joint]) => {
    if (!joint) {
      return acc;
    }
    const canonicalName = jointName as CanonicalJointName;
    const mirroredJointName = resolveMirroredJointName(canonicalName);
    acc[mirroredJointName] = {
      ...joint,
      x: -joint.x
    };
    return acc;
  }, {});
  return {
    joints: mirrored,
    debug: runtimeNormalized.debug
  };
}

function resolveMirroredJointName(jointName: CanonicalJointName): CanonicalJointName {
  for (const [leftJointName, rightJointName] of LEFT_RIGHT_JOINT_PAIRS) {
    if (jointName === leftJointName) {
      return rightJointName;
    }
    if (jointName === rightJointName) {
      return leftJointName;
    }
  }
  return jointName;
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
