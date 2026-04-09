import type { PortableDrill, PortableDrillAnalysis } from "../schema/contracts.ts";

export type RuntimeMeasurementMode = "rep" | "hold";

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

export function buildPhaseRuntimeModel(drill: PortableDrill, analysis: PortableDrillAnalysis): PhaseRuntimeModel {
  const sortedPhases = [...drill.phases].sort((a, b) => a.order - b.order);
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

  const measurementMode: RuntimeMeasurementMode = analysis.measurementType === "hold" ? "hold" : "rep";
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
    measurementType: analysis.measurementType,
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

function averageJointDistance(phaseAId: string, phaseBId: string, drill: PortableDrill): number | null {
  const phaseA = drill.phases.find((phase) => phase.phaseId === phaseAId);
  const phaseB = drill.phases.find((phase) => phase.phaseId === phaseBId);
  const jointsA = phaseA?.poseSequence[0]?.joints;
  const jointsB = phaseB?.poseSequence[0]?.joints;
  if (!jointsA || !jointsB) {
    return null;
  }

  let total = 0;
  let compared = 0;
  const allJointNames = new Set([...Object.keys(jointsA), ...Object.keys(jointsB)]);
  for (const jointName of allJointNames) {
    const a = jointsA[jointName as keyof typeof jointsA];
    const b = jointsB[jointName as keyof typeof jointsB];
    if (!a || !b) {
      continue;
    }
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    total += Math.sqrt(dx * dx + dy * dy);
    compared += 1;
  }

  if (compared === 0) {
    return null;
  }
  return total / compared;
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
      const distance = averageJointDistance(phaseAId, phaseBId, drill);
      if (distance === null) {
        continue;
      }
      const similarity = Math.max(0, Math.min(1, 1 - distance));
      const severity = similarity >= 0.92 ? "ambiguous" : similarity >= 0.84 ? "similar" : null;
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
