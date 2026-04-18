import type { DrillBenchmark, DrillPackage, PortableDrill } from "../schema/contracts.ts";

export type PublishableReadyVersion = {
  status: "draft" | "ready";
  packageJson: DrillPackage;
};

function assertPublishReadiness(pkg: DrillPackage): void {
  const drill = pkg.drills[0];
  if (!drill?.title?.trim()) {
    throw new Error("Publish blocked: Drill title is required.");
  }
  if (!drill.phases?.length) {
    throw new Error("Publish blocked: At least one phase is required.");
  }
  if (drill.phases.some((phase) => !phase.name.trim() || !phase.poseSequence?.length || !Object.keys(phase.poseSequence[0]?.joints ?? {}).length)) {
    throw new Error("Publish blocked: Each phase must include a name and authored pose data.");
  }
}

function createBenchmarkFromReleasedDrill(drill: PortableDrill): DrillBenchmark {
  const normalizedPhases = [...drill.phases]
    .sort((a, b) => a.order - b.order)
    .map((phase, index) => ({
      key: phase.phaseId?.trim() || `benchmark_phase_${index + 1}`,
      label: phase.name?.trim() || `Phase ${index + 1}`,
      order: index + 1,
      targetDurationMs: typeof phase.durationMs === "number" && phase.durationMs > 0 ? phase.durationMs : undefined,
      notes: phase.summary?.trim() || undefined,
      pose: phase.poseSequence?.[0] ? structuredClone(phase.poseSequence[0]) : undefined
    }));

  const phaseDurationsMs = Object.fromEntries(
    normalizedPhases
      .filter((phase) => typeof phase.targetDurationMs === "number" && phase.targetDurationMs > 0)
      .map((phase) => [phase.key, phase.targetDurationMs as number])
  );
  const timing: DrillBenchmark["timing"] = { phaseDurationsMs };
  if (drill.drillType === "hold") {
    timing.targetHoldDurationMs = normalizedPhases[0]?.targetDurationMs;
  } else {
    const expectedRepDurationMs = normalizedPhases.reduce((total, phase) => total + (phase.targetDurationMs ?? 0), 0);
    timing.expectedRepDurationMs = expectedRepDurationMs > 0 ? expectedRepDurationMs : undefined;
  }

  return {
    sourceType: "reference_pose_sequence",
    movementType: drill.drillType,
    cameraView: drill.primaryView,
    status: "draft",
    phaseSequence: normalizedPhases,
    timing
  };
}

export function finalizePublishedReadyVersion(version: PublishableReadyVersion): DrillPackage {
  if (version.status !== "ready") {
    throw new Error("Only Ready versions can be published.");
  }

  const pkg = structuredClone(version.packageJson);
  assertPublishReadiness(pkg);

  const releasedDrill = pkg.drills[0];
  if (!releasedDrill) {
    throw new Error("Publish blocked: released version drill payload is missing.");
  }

  releasedDrill.benchmark = createBenchmarkFromReleasedDrill(releasedDrill);
  if (!releasedDrill.benchmark?.phaseSequence?.length) {
    throw new Error("Publish blocked: benchmark generation failed for released drill version.");
  }

  pkg.manifest.publishing = { ...(pkg.manifest.publishing ?? {}), publishStatus: "published" };
  return pkg;
}
