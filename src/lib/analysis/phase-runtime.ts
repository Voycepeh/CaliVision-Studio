import type { PortableDrill, PortableDrillAnalysis } from "../schema/contracts.ts";
import { compareNormalizedJoints } from "./pose-comparison.ts";

export type RuntimeMeasurementMode = "rep" | "hold";

export function resolveDrillMeasurementType(drill: PortableDrill, analysis: PortableDrillAnalysis): PortableDrillAnalysis["measurementType"] {
  if (drill.drillType === "hold") {
    return "hold";
  }
  return analysis.measurementType;
}

export type RuntimePhase = {
  phaseId: string;
  sequenceIndex: number;
  sequenceNumber: number;
  authoredOrder: number;
  authoredName: string;
  displayLabel: string;
  hudLabel: string;
};

export type PhaseSimilarityWarning = {
  phaseAId: string;
  phaseBId: string;
  phaseALabel: string;
  phaseBLabel: string;
  score: number;
  severity: "similar" | "ambiguous";
  adjacentInLoop: boolean;
};

export type RuntimeDisplayPhase = {
  phaseId: string;
  sequenceIndex: number;
  sequenceNumber: number;
  runtimeLabel: string;
  phase: PortableDrill["phases"][number];
};

export type PhaseRuntimeModel = {
  phases: RuntimePhase[];
  phaseById: Record<string, RuntimePhase>;
  phaseLabelById: Record<string, string>;
  orderedPhaseIds: string[];
  loopPhaseIds: string[];
  loopLabel: string;
  phaseCount: number;
  allowedTransitionKeys: Set<string>;
  measurementType: PortableDrillAnalysis["measurementType"];
  measurementMode: RuntimeMeasurementMode;
  repRequiresAtLeastPhaseCount: number;
  repCompletionSummary: string;
  holdPhaseId: string | null;
  holdPhaseLabel: string | null;
  holdSummary: string;
  legacyAnalysisOrder: string[];
  legacyOrderMismatch: boolean;
  legacyOrderMismatchDetails: string[];
};

function normalizePhaseName(name: string | undefined, fallback: string): string {
  const trimmed = (name ?? "").trim();
  return trimmed || fallback;
}

function toUniqueOrderedIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    unique.push(id);
  }
  return unique;
}

function toSortedPhases(drill: PortableDrill): PortableDrill["phases"] {
  return [...drill.phases].sort((a, b) => a.order - b.order);
}

function resolveFallbackPhaseName(phase: PortableDrill["phases"][number], sequenceNumber: number): string {
  const trimmed = (phase.name || phase.title || "").trim();
  return trimmed || `Phase ${sequenceNumber}`;
}

export function buildPhaseRuntimeModel(drill: PortableDrill, analysis: PortableDrillAnalysis): PhaseRuntimeModel {
  const sortedPhases = toSortedPhases(drill);
  const authoredPhaseIds = sortedPhases.map((phase) => phase.phaseId);
  const orderedPhaseIds = toUniqueOrderedIds(authoredPhaseIds);
  const authoredSet = new Set(orderedPhaseIds);
  const legacyAnalysisOrder = toUniqueOrderedIds((analysis.orderedPhaseSequence ?? []).filter((phaseId) => authoredSet.has(phaseId)));
  const legacyMissingFromAnalysis = orderedPhaseIds.filter((phaseId) => !legacyAnalysisOrder.includes(phaseId));
  const legacyStaleIds = toUniqueOrderedIds((analysis.orderedPhaseSequence ?? []).filter((phaseId) => !authoredSet.has(phaseId)));
  const sameOrder = legacyAnalysisOrder.length === orderedPhaseIds.length
    && legacyAnalysisOrder.every((phaseId, index) => phaseId === orderedPhaseIds[index]);
  const legacyOrderMismatchDetails: string[] = [];
  if (!sameOrder) {
    legacyOrderMismatchDetails.push("legacy_analysis_sequence_differs_from_authored_phase_order");
  }
  if (legacyMissingFromAnalysis.length > 0) {
    legacyOrderMismatchDetails.push("legacy_analysis_missing_authored_phase_ids");
  }
  if (legacyStaleIds.length > 0) {
    legacyOrderMismatchDetails.push("legacy_analysis_contains_stale_phase_ids");
  }
  const legacyOrderMismatch = legacyOrderMismatchDetails.length > 0;

  const phaseById = orderedPhaseIds.reduce<Record<string, RuntimePhase>>((acc, phaseId, index) => {
    const phase = sortedPhases.find((item) => item.phaseId === phaseId);
    const authoredName = normalizePhaseName(phase?.name || phase?.title, phaseId);
    const sequenceNumber = index + 1;
    acc[phaseId] = {
      phaseId,
      sequenceIndex: index,
      sequenceNumber,
      authoredOrder: phase?.order ?? sequenceNumber,
      authoredName,
      displayLabel: `${sequenceNumber}. ${authoredName}`,
      hudLabel: `Phase ${sequenceNumber}/${orderedPhaseIds.length} · ${authoredName}`
    };
    return acc;
  }, {});

  const phases = orderedPhaseIds.map((phaseId) => phaseById[phaseId]!);
  const phaseCount = phases.length;
  const loopPhaseIds = phaseCount > 1 ? [...orderedPhaseIds, orderedPhaseIds[0]!] : [...orderedPhaseIds];

  const allowedTransitionKeys = new Set<string>();
  for (let index = 0; index < loopPhaseIds.length - 1; index += 1) {
    const from = loopPhaseIds[index];
    const to = loopPhaseIds[index + 1];
    if (from && to && from !== to) {
      allowedTransitionKeys.add(`${from}->${to}`);
    }
  }
  for (const skip of analysis.allowedPhaseSkips ?? []) {
    if (phaseById[skip.fromPhaseId] && phaseById[skip.toPhaseId]) {
      allowedTransitionKeys.add(`${skip.fromPhaseId}->${skip.toPhaseId}`);
    }
  }

  const resolvedMeasurementType = resolveDrillMeasurementType(drill, analysis);
  const measurementMode: RuntimeMeasurementMode = resolvedMeasurementType === "hold" ? "hold" : "rep";
  const holdPhaseId = measurementMode === "hold"
    ? (analysis.targetHoldPhaseId && phaseById[analysis.targetHoldPhaseId] ? analysis.targetHoldPhaseId : orderedPhaseIds[0] ?? null)
    : null;
  const holdPhaseLabel = holdPhaseId ? phaseById[holdPhaseId]?.displayLabel ?? holdPhaseId : null;

  return {
    phases,
    phaseById,
    phaseLabelById: phases.reduce<Record<string, string>>((acc, phase) => {
      acc[phase.phaseId] = phase.displayLabel;
      return acc;
    }, {}),
    orderedPhaseIds,
    loopPhaseIds,
    loopLabel: loopPhaseIds.map((phaseId) => phaseById[phaseId]?.displayLabel ?? phaseId).join(" -> "),
    phaseCount,
    allowedTransitionKeys,
    measurementType: resolvedMeasurementType,
    measurementMode,
    repRequiresAtLeastPhaseCount: 2,
    repCompletionSummary: "Rep drills count one rep when the full loop returns to phase 1.",
    holdPhaseId,
    holdPhaseLabel,
    holdSummary: holdPhaseLabel
      ? `Hold drills track time while ${holdPhaseLabel} is confidently matched.`
      : "Hold drills track time while the selected hold phase is confidently matched.",
    legacyAnalysisOrder,
    legacyOrderMismatch,
    legacyOrderMismatchDetails
  };
}

export function getOrderedRuntimePhases(drill: PortableDrill): RuntimeDisplayPhase[] {
  const sortedPhases = toSortedPhases(drill);
  const phaseById = sortedPhases.reduce<Record<string, PortableDrill["phases"][number]>>((acc, phase) => {
    acc[phase.phaseId] = phase;
    return acc;
  }, {});

  if (drill.analysis) {
    const runtimeModel = buildPhaseRuntimeModel(drill, drill.analysis);
    return runtimeModel.orderedPhaseIds
      .map((phaseId, sequenceIndex) => {
        const phase = phaseById[phaseId];
        const runtimeLabel = runtimeModel.phaseLabelById[phaseId] ?? `${sequenceIndex + 1}. Phase ${sequenceIndex + 1}`;
        if (!phase) {
          return null;
        }
        return {
          phaseId,
          sequenceIndex,
          sequenceNumber: sequenceIndex + 1,
          runtimeLabel,
          phase
        };
      })
      .filter((entry): entry is RuntimeDisplayPhase => Boolean(entry));
  }

  return sortedPhases.map((phase, sequenceIndex) => {
    const sequenceNumber = sequenceIndex + 1;
    const runtimeName = resolveFallbackPhaseName(phase, sequenceNumber);
    return {
      phaseId: phase.phaseId,
      sequenceIndex,
      sequenceNumber,
      runtimeLabel: `${sequenceNumber}. ${runtimeName}`,
      phase
    };
  });
}

export function buildRuntimePhaseLabelMap(drill: PortableDrill): Record<string, string> {
  return getOrderedRuntimePhases(drill).reduce<Record<string, string>>((acc, phase) => {
    acc[phase.phaseId] = phase.runtimeLabel;
    return acc;
  }, {});
}

export function resolveAuthoredPhaseLabel(phaseId: string | null | undefined, phaseLabelById: Record<string, string>): string | null {
  if (!phaseId) {
    return null;
  }
  return phaseLabelById[phaseId] ?? null;
}

export function filterPhaseIdsToRuntime(phaseIds: Array<string | null | undefined>, runtimeModel: PhaseRuntimeModel): string[] {
  const allowed = new Set(runtimeModel.orderedPhaseIds);
  return phaseIds.filter((phaseId): phaseId is string => Boolean(phaseId && allowed.has(phaseId)));
}

function comparePhasePoses(phaseAId: string, phaseBId: string, drill: PortableDrill): { similarityScore: number; isMeaningfullyDissimilar: boolean } | null {
  const phaseA = drill.phases.find((phase) => phase.phaseId === phaseAId);
  const phaseB = drill.phases.find((phase) => phase.phaseId === phaseBId);
  const jointsA = phaseA?.poseSequence[0]?.joints;
  const jointsB = phaseB?.poseSequence[0]?.joints;
  if (!jointsA || !jointsB) {
    return null;
  }

  const norm = computePhaseNormalizationDistance(jointsA, jointsB);
  return compareNormalizedJoints(jointsA, jointsB, { normalizationDistance: norm });
}

function computePhaseNormalizationDistance(
  jointsA: NonNullable<PortableDrill["phases"][number]["poseSequence"][number]>["joints"],
  jointsB: NonNullable<PortableDrill["phases"][number]["poseSequence"][number]>["joints"]
): number {
  const leftHip = jointsA.leftHip ?? jointsB.leftHip;
  const rightHip = jointsA.rightHip ?? jointsB.rightHip;
  const leftShoulder = jointsA.leftShoulder ?? jointsB.leftShoulder;
  const rightShoulder = jointsA.rightShoulder ?? jointsB.rightShoulder;

  const hipWidth = leftHip && rightHip ? Math.hypot(leftHip.x - rightHip.x, leftHip.y - rightHip.y) : 0;
  const shoulderWidth = leftShoulder && rightShoulder
    ? Math.hypot(leftShoulder.x - rightShoulder.x, leftShoulder.y - rightShoulder.y)
    : 0;

  return Math.max(0.2, hipWidth, shoulderWidth);
}

export function buildPhaseSimilarityWarnings(drill: PortableDrill, runtimeModel: PhaseRuntimeModel): PhaseSimilarityWarning[] {
  if (runtimeModel.phaseCount < 2) {
    return [];
  }

  const warnings: PhaseSimilarityWarning[] = [];
  const ids = runtimeModel.orderedPhaseIds;

  for (let index = 0; index < ids.length; index += 1) {
    for (let other = index + 1; other < ids.length; other += 1) {
      const phaseAId = ids[index]!;
      const phaseBId = ids[other]!;
      const comparison = comparePhasePoses(phaseAId, phaseBId, drill);
      if (!comparison || comparison.isMeaningfullyDissimilar) {
        continue;
      }
      const similarity = comparison.similarityScore;
      const severity = similarity >= 0.88 ? "ambiguous" : similarity >= 0.76 ? "similar" : null;
      if (!severity) {
        continue;
      }

      const adjacentInLoop = other - index === 1 || (index === 0 && other === ids.length - 1);
      warnings.push({
        phaseAId,
        phaseBId,
        phaseALabel: runtimeModel.phaseById[phaseAId]?.displayLabel ?? phaseAId,
        phaseBLabel: runtimeModel.phaseById[phaseBId]?.displayLabel ?? phaseBId,
        score: Number(similarity.toFixed(3)),
        severity,
        adjacentInLoop
      });
    }
  }

  return warnings.sort((a, b) => b.score - a.score);
}
