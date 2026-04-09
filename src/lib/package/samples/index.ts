import validSamplePackage from "@/lib/package/samples/valid-sample-package.json";
import invalidSamplePackage from "@/lib/package/samples/invalid-sample-package.json";
import type { DrillPackage, PortableDrill } from "@/lib/schema/contracts";

export type SamplePackageDefinition = {
  id: string;
  label: string;
  description: string;
  payload: unknown;
  expectedValidity: "valid" | "invalid";
};

export const SAMPLE_PACKAGE_DEFINITIONS: SamplePackageDefinition[] = [
  {
    id: "sample-valid-reactive-defense",
    label: "Reactive Defense (valid)",
    description: "Android-compatible sample drill file used as a local bootstrap fixture.",
    payload: validSamplePackage,
    expectedValidity: "valid"
  },
  {
    id: "sample-invalid-validation-fixture",
    label: "Invalid sample drill file",
    description: "Intentionally invalid drill file for testing error surfacing in Studio.",
    payload: invalidSamplePackage,
    expectedValidity: "invalid"
  }
];

const SIMPLE_REP_VALIDATION_PACKAGE: DrillPackage = {
  manifest: {
    schemaVersion: "0.1.0",
    packageId: "pkg_simple_rep_validation_001",
    packageVersion: "0.1.0",
    createdAtIso: "2026-04-08T00:00:00.000Z",
    updatedAtIso: "2026-04-08T00:00:00.000Z",
    source: "web-studio",
    compatibility: {
      androidMinVersion: "1.2.0",
      androidTargetContract: "drill-package-0.1.0"
    }
  },
  drills: [
    {
      drillId: "drill_simple_two_phase_rep_001",
      slug: "simple-two-phase-rep",
      title: "Simple Two-Phase Rep Validation",
      description: "Minimal two-phase rep drill for validating phase transitions and rep completion.",
      drillType: "rep",
      difficulty: "beginner",
      tags: ["validation", "rep"],
      primaryView: "front",
      analysis: {
        measurementType: "rep",
        orderedPhaseSequence: ["phase_a", "phase_b", "phase_a"],
        criticalPhaseIds: ["phase_b"],
        allowedPhaseSkips: [],
        minimumConfirmationFrames: 1,
        exitGraceFrames: 1,
        minimumRepDurationMs: 250,
        cooldownMs: 100,
        entryConfirmationFrames: 1,
        minimumHoldDurationMs: 300
      },
      phases: [
        { phaseId: "phase_a", order: 1, name: "Phase A", durationMs: 500, poseSequence: [], assetRefs: [] },
        { phaseId: "phase_b", order: 2, name: "Phase B", durationMs: 500, poseSequence: [], assetRefs: [] }
      ]
    }
  ],
  assets: []
};

const SIMPLE_HOLD_VALIDATION_PACKAGE: DrillPackage = {
  manifest: {
    schemaVersion: "0.1.0",
    packageId: "pkg_simple_hold_validation_001",
    packageVersion: "0.1.0",
    createdAtIso: "2026-04-08T00:00:00.000Z",
    updatedAtIso: "2026-04-08T00:00:00.000Z",
    source: "web-studio",
    compatibility: {
      androidMinVersion: "1.2.0",
      androidTargetContract: "drill-package-0.1.0"
    }
  },
  drills: [
    {
      drillId: "drill_simple_hold_validation_001",
      slug: "simple-hold-validation",
      title: "Simple Hold Validation",
      description: "Single-target hold drill for validating hold entry/exit timing in analysis.",
      drillType: "hold",
      difficulty: "beginner",
      tags: ["validation", "hold"],
      primaryView: "front",
      analysis: {
        measurementType: "hold",
        orderedPhaseSequence: ["phase_entry", "phase_hold"],
        criticalPhaseIds: ["phase_hold"],
        allowedPhaseSkips: [],
        minimumConfirmationFrames: 1,
        exitGraceFrames: 1,
        minimumRepDurationMs: 250,
        cooldownMs: 100,
        entryConfirmationFrames: 1,
        minimumHoldDurationMs: 1000,
        targetHoldPhaseId: "phase_hold"
      },
      phases: [
        { phaseId: "phase_entry", order: 1, name: "Entry", durationMs: 600, poseSequence: [], assetRefs: [] },
        { phaseId: "phase_hold", order: 2, name: "Hold", durationMs: 3000, poseSequence: [], assetRefs: [] }
      ]
    }
  ],
  assets: []
};

export function listSeededSampleDrills(): Array<{
  drill: PortableDrill;
  packageId: string;
  packageVersion: string;
  sourceLabel: string;
}> {
  const seededPackages: DrillPackage[] = [validSamplePackage as DrillPackage, SIMPLE_REP_VALIDATION_PACKAGE, SIMPLE_HOLD_VALIDATION_PACKAGE];
  return seededPackages.flatMap((pkg) =>
    pkg.drills.map((drill) => ({
      drill,
      packageId: pkg.manifest.packageId,
      packageVersion: pkg.manifest.packageVersion,
      sourceLabel: `seeded:${pkg.manifest.packageId}`
    }))
  );
}

export function getPrimarySamplePackage(): DrillPackage {
  return validSamplePackage as DrillPackage;
}
