import type { CanonicalJointName, PortableJointPoint } from "../schema/contracts.ts";

const DEFAULT_DISTANCE_TOLERANCE = 0.4;

export const POSE_COMPARISON_TUNING = {
  deltaThresholdA: 0.18,
  deltaThresholdB: 0.3,
  singleJointLargeDelta: 0.42,
  topKJointRatio: 0.3,
  topKJointMin: 1,
  topKJointMax: 4,
  changedRatioGateA: 0.25,
  changedRatioGateB: 0.15,
  changedCountGateA: 2,
  changedCountGateB: 1,
  winnerMarginMin: 0.08,
  winnerMarginRatio: 0.18
} as const;

export type PoseComparisonMetrics = {
  jointCount: number;
  deltas: number[];
  meanDelta: number;
  maxDelta: number;
  topKMeanDelta: number;
  topKCount: number;
  countAboveThresholdA: number;
  countAboveThresholdB: number;
  ratioAboveThresholdA: number;
  ratioAboveThresholdB: number;
  dissimilarityScore: number;
  similarityScore: number;
  isMeaningfullyDissimilar: boolean;
};

export function compareNormalizedJoints(
  sourceJoints: Partial<Record<CanonicalJointName, PortableJointPoint | { x: number; y: number }>>,
  targetJoints: Partial<Record<CanonicalJointName, PortableJointPoint | { x: number; y: number }>>,
  options: {
    jointNames?: CanonicalJointName[];
    normalizationDistance: number;
    tolerance?: number;
    confidenceByJoint?: Partial<Record<CanonicalJointName, number>>;
    minimumConfidence?: number;
  }
): PoseComparisonMetrics {
  const tolerance = Math.max(0.05, options.tolerance ?? DEFAULT_DISTANCE_TOLERANCE);
  const norm = Math.max(0.05, options.normalizationDistance);
  const minimumConfidence = clamp01(options.minimumConfidence ?? 0.35);
  const jointPool = options.jointNames ?? (Object.keys({ ...sourceJoints, ...targetJoints }) as CanonicalJointName[]);

  const weightedEntries: Array<{ delta: number; confidence: number }> = [];
  for (const jointName of jointPool) {
    const source = sourceJoints[jointName];
    const target = targetJoints[jointName];
    if (!source || !target) {
      continue;
    }
    const confidence = clamp01(options.confidenceByJoint?.[jointName] ?? 1);
    if (confidence < minimumConfidence) {
      continue;
    }
    weightedEntries.push({
      delta: Math.hypot(source.x - target.x, source.y - target.y) / norm,
      confidence
    });
  }

  const sortedEntries = [...weightedEntries].sort((a, b) => b.delta - a.delta);
  const deltas = weightedEntries.map((entry) => entry.delta);
  const jointCount = deltas.length;
  if (jointCount === 0) {
    return {
      jointCount,
      deltas,
      meanDelta: Number.POSITIVE_INFINITY,
      maxDelta: Number.POSITIVE_INFINITY,
      topKMeanDelta: Number.POSITIVE_INFINITY,
      topKCount: 0,
      countAboveThresholdA: 0,
      countAboveThresholdB: 0,
      ratioAboveThresholdA: 0,
      ratioAboveThresholdB: 0,
      dissimilarityScore: 1,
      similarityScore: 0,
      isMeaningfullyDissimilar: true
    };
  }

  const topKCount = clampInt(Math.ceil(jointCount * POSE_COMPARISON_TUNING.topKJointRatio), POSE_COMPARISON_TUNING.topKJointMin, Math.min(jointCount, POSE_COMPARISON_TUNING.topKJointMax));
  const topKEntries = sortedEntries.slice(0, topKCount);

  const totalConfidence = weightedEntries.reduce((sum, entry) => sum + entry.confidence, 0);
  const meanDelta = weightedAverage(weightedEntries);
  const maxDelta = sortedEntries[0]?.delta ?? 0;
  const topKMeanDelta = weightedAverage(topKEntries);
  const countAboveThresholdA = weightedEntries.reduce((sum, entry) => sum + (entry.delta >= POSE_COMPARISON_TUNING.deltaThresholdA ? entry.confidence : 0), 0);
  const countAboveThresholdB = weightedEntries.reduce((sum, entry) => sum + (entry.delta >= POSE_COMPARISON_TUNING.deltaThresholdB ? entry.confidence : 0), 0);
  const ratioAboveThresholdA = totalConfidence > 0 ? countAboveThresholdA / totalConfidence : 0;
  const ratioAboveThresholdB = totalConfidence > 0 ? countAboveThresholdB / totalConfidence : 0;

  const dissimilarityFromSingleJoint = clamp01(maxDelta / POSE_COMPARISON_TUNING.singleJointLargeDelta);
  const dissimilarityFromTopK = clamp01(topKMeanDelta / (tolerance * 0.9));
  const dissimilarityFromMean = clamp01(meanDelta / (tolerance * 1.1));
  const dissimilarityFromChangedRatioA = clamp01(ratioAboveThresholdA / POSE_COMPARISON_TUNING.changedRatioGateA);
  const dissimilarityFromChangedRatioB = clamp01(ratioAboveThresholdB / POSE_COMPARISON_TUNING.changedRatioGateB);

  const dissimilarityScore = clamp01(
    Math.max(
      dissimilarityFromSingleJoint,
      dissimilarityFromTopK * 0.85 + dissimilarityFromChangedRatioA * 0.15,
      dissimilarityFromChangedRatioB * 0.9 + dissimilarityFromMean * 0.1,
      dissimilarityFromMean * 0.5
    )
  );

  const isMeaningfullyDissimilar = dissimilarityFromSingleJoint >= 1
    || meetsJointChangeGate(countAboveThresholdB, ratioAboveThresholdB, totalConfidence, {
      minimumAbsolute: POSE_COMPARISON_TUNING.changedCountGateB,
      minimumRatio: POSE_COMPARISON_TUNING.changedRatioGateB
    })
    || meetsJointChangeGate(countAboveThresholdA, ratioAboveThresholdA, totalConfidence, {
      minimumAbsolute: POSE_COMPARISON_TUNING.changedCountGateA,
      minimumRatio: POSE_COMPARISON_TUNING.changedRatioGateA
    })
    || dissimilarityFromTopK > 0.95;

  return {
    jointCount,
    deltas,
    meanDelta,
    maxDelta,
    topKMeanDelta,
    topKCount,
    countAboveThresholdA,
    countAboveThresholdB,
    ratioAboveThresholdA,
    ratioAboveThresholdB,
    dissimilarityScore,
    similarityScore: clamp01(1 - dissimilarityScore),
    isMeaningfullyDissimilar
  };
}

export function winnerHasClearMargin(bestScore: number, secondBestScore: number): boolean {
  const margin = bestScore - secondBestScore;
  const ratioTarget = Math.max(POSE_COMPARISON_TUNING.winnerMarginMin, bestScore * POSE_COMPARISON_TUNING.winnerMarginRatio);
  return margin >= ratioTarget;
}

function meetsJointChangeGate(
  changedCount: number,
  changedRatio: number,
  effectiveJointCount: number,
  options: { minimumAbsolute: number; minimumRatio: number }
): boolean {
  const absoluteGate = Math.min(effectiveJointCount, options.minimumAbsolute);
  return changedCount >= absoluteGate && changedRatio >= options.minimumRatio;
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function weightedAverage(entries: Array<{ delta: number; confidence: number }>): number {
  if (entries.length === 0) return 0;
  const confidenceTotal = entries.reduce((sum, entry) => sum + entry.confidence, 0);
  if (confidenceTotal <= 0) return 0;
  return entries.reduce((sum, entry) => sum + entry.delta * entry.confidence, 0) / confidenceTotal;
}
