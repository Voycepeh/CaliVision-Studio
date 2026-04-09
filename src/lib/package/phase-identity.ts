import type { PortableAssetRef, PortableDrill, PortableDrillAnalysis, PortablePhase } from "@/lib/schema/contracts";

const LEGACY_SYSTEM_PHASE_ID_PATTERN = /^phase_(top|bottom|new)(?:_\d+)?$/i;

function isLegacySystemPhaseId(phaseId: string): boolean {
  return LEGACY_SYSTEM_PHASE_ID_PATTERN.test(phaseId.trim());
}

function createOpaquePhaseId(existing: Set<string>): string {
  let candidate = `phase_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  while (existing.has(candidate)) {
    candidate = `phase_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
  return candidate;
}

function deriveFallbackTitle(phase: PortablePhase, order: number): string {
  const title = phase.title?.trim();
  if (title) {
    return title;
  }

  const legacy = phase as PortablePhase & {
    phaseName?: unknown;
    name?: unknown;
    label?: unknown;
  };
  const fallbackText = [legacy.phaseName, legacy.name, legacy.label].find(
    (value): value is string => typeof value === "string" && value.trim().length > 0
  );

  if (fallbackText) {
    return fallbackText.trim();
  }

  return `Phase ${order}`;
}

function remapAnalysis(analysis: PortableDrillAnalysis | undefined, phaseIdMap: Map<string, string>): PortableDrillAnalysis | undefined {
  if (!analysis) {
    return analysis;
  }

  const remap = (phaseId: string): string => phaseIdMap.get(phaseId) ?? phaseId;

  return {
    ...analysis,
    orderedPhaseSequence: analysis.orderedPhaseSequence.map(remap),
    criticalPhaseIds: analysis.criticalPhaseIds.map(remap),
    allowedPhaseSkips: analysis.allowedPhaseSkips.map((transition) => ({
      ...transition,
      fromPhaseId: remap(transition.fromPhaseId),
      toPhaseId: remap(transition.toPhaseId),
      skippedPhaseIds: transition.skippedPhaseIds.map(remap)
    })),
    targetHoldPhaseId: analysis.targetHoldPhaseId ? remap(analysis.targetHoldPhaseId) : analysis.targetHoldPhaseId
  };
}

function remapAssetOwnerPhaseIds(assets: PortableAssetRef[], phaseIdMap: Map<string, string>): PortableAssetRef[] {
  return assets.map((asset) => ({
    ...asset,
    ownerPhaseId: asset.ownerPhaseId ? phaseIdMap.get(asset.ownerPhaseId) ?? asset.ownerPhaseId : asset.ownerPhaseId
  }));
}

export function normalizeDrillPhaseIdentity(drill: PortableDrill): PortableDrill {
  const existing = new Set<string>();
  const phaseIdMap = new Map<string, string>();
  const normalizedPhases = [...drill.phases]
    .sort((a, b) => a.order - b.order)
    .map((phase, index) => {
      const sourcePhaseId = phase.phaseId?.trim() ?? "";
      const requiresOpaqueId =
        sourcePhaseId.length === 0 || existing.has(sourcePhaseId) || isLegacySystemPhaseId(sourcePhaseId);
      const phaseId = requiresOpaqueId ? createOpaquePhaseId(existing) : sourcePhaseId;
      existing.add(phaseId);
      phaseIdMap.set(sourcePhaseId, phaseId);

      return {
        ...phase,
        phaseId,
        title: deriveFallbackTitle(phase, index + 1)
      };
    });

  return {
    ...drill,
    analysis: remapAnalysis(drill.analysis, phaseIdMap),
    phases: normalizedPhases.map((phase) => ({
      ...phase,
      assetRefs: remapAssetOwnerPhaseIds(phase.assetRefs, phaseIdMap)
    }))
  };
}
