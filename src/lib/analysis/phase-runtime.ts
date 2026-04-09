import type { PortableDrill, PortableDrillAnalysis } from "../schema/contracts.ts";

export type PhaseRuntimeModel = {
  phaseLabelById: Record<string, string>;
  orderedPhaseIds: string[];
  allowedTransitionKeys: Set<string>;
  measurementType: PortableDrillAnalysis["measurementType"];
};

export function buildPhaseRuntimeModel(drill: PortableDrill, analysis: PortableDrillAnalysis): PhaseRuntimeModel {
  const authoredPhaseIds = new Set(drill.phases.map((phase) => phase.phaseId));
  const orderedPhaseIds = analysis.orderedPhaseSequence.filter((phaseId) => authoredPhaseIds.has(phaseId));
  const fallbackOrder = [...drill.phases].sort((a, b) => a.order - b.order).map((phase) => phase.phaseId);
  const resolvedOrder = orderedPhaseIds.length > 0 ? orderedPhaseIds : fallbackOrder;

  const allowedTransitionKeys = new Set<string>();
  for (let index = 0; index < resolvedOrder.length - 1; index += 1) {
    allowedTransitionKeys.add(`${resolvedOrder[index]}->${resolvedOrder[index + 1]}`);
  }
  if (
    (analysis.measurementType === "rep" || analysis.measurementType === "hybrid")
    && resolvedOrder.length > 1
    && resolvedOrder[resolvedOrder.length - 1] !== resolvedOrder[0]
  ) {
    allowedTransitionKeys.add(`${resolvedOrder[resolvedOrder.length - 1]}->${resolvedOrder[0]}`);
  }
  for (const skip of analysis.allowedPhaseSkips ?? []) {
    if (authoredPhaseIds.has(skip.fromPhaseId) && authoredPhaseIds.has(skip.toPhaseId)) {
      allowedTransitionKeys.add(`${skip.fromPhaseId}->${skip.toPhaseId}`);
    }
  }

  const phaseLabelById = drill.phases.reduce<Record<string, string>>((acc, phase) => {
    const label = (phase.name || phase.title || "").trim();
    acc[phase.phaseId] = label || phase.phaseId;
    return acc;
  }, {});

  return {
    phaseLabelById,
    orderedPhaseIds: resolvedOrder,
    allowedTransitionKeys,
    measurementType: analysis.measurementType
  };
}

export function resolveAuthoredPhaseLabel(phaseId: string | null | undefined, phaseLabelById: Record<string, string>): string | null {
  if (!phaseId) {
    return null;
  }
  return phaseLabelById[phaseId] ?? phaseId;
}
