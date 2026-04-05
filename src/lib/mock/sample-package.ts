import type { DrillPackage, PortableDrill } from "@/lib/contracts";

export const sampleDrill: PortableDrill = {
  drillId: "drill_reactive_defense_001",
  slug: "reactive-defense-ladder",
  title: "Reactive Defense Ladder",
  description: "Sample drill aligned to Android-compatible package semantics.",
  difficulty: "intermediate",
  tags: ["defense", "footwork", "timing"],
  defaultView: "side",
  phases: [
    {
      phaseId: "phase_setup",
      order: 1,
      title: "Setup stance",
      summary: "Create a stable shoulder-width stance before movement.",
      durationMs: 8000,
      startOffsetMs: 0,
      poseSequence: [
        {
          poseId: "pose_setup_001",
          timestampMs: 0,
          canvas: {
            coordinateSystem: "normalized-2d",
            widthRef: 1,
            heightRef: 1,
            view: "side"
          },
          joints: {
            nose: { x: 0.5, y: 0.12, confidence: 0.98 },
            leftShoulder: { x: 0.42, y: 0.28, confidence: 0.96 },
            rightShoulder: { x: 0.58, y: 0.29, confidence: 0.97 },
            leftHip: { x: 0.46, y: 0.54, confidence: 0.95 },
            rightHip: { x: 0.56, y: 0.54, confidence: 0.94 },
            leftAnkle: { x: 0.44, y: 0.92, confidence: 0.92 },
            rightAnkle: { x: 0.59, y: 0.91, confidence: 0.92 }
          }
        }
      ],
      assetRefs: [
        {
          assetId: "asset_overlay_setup",
          type: "overlay",
          uri: "assets/overlay_setup.png",
          mimeType: "image/png"
        }
      ]
    },
    {
      phaseId: "phase_motion",
      order: 2,
      title: "Primary movement",
      durationMs: 16000,
      startOffsetMs: 8000,
      poseSequence: [],
      assetRefs: []
    },
    {
      phaseId: "phase_reset",
      order: 3,
      title: "Recovery + reset",
      durationMs: 10000,
      startOffsetMs: 24000,
      poseSequence: [],
      assetRefs: []
    }
  ]
};

export const sampleDrillPackage: DrillPackage = {
  manifest: {
    schemaVersion: "0.1.0",
    packageId: "pkg_reactive_defense_001",
    packageVersion: "0.1.0",
    createdAtIso: "2026-04-05T00:00:00.000Z",
    updatedAtIso: "2026-04-05T00:00:00.000Z",
    source: "web-studio",
    compatibility: {
      androidMinVersion: "1.2.0",
      androidTargetContract: "drill-package-0.1.0"
    }
  },
  drills: [sampleDrill],
  assets: [
    {
      assetId: "asset_overlay_setup",
      type: "overlay",
      uri: "assets/overlay_setup.png",
      mimeType: "image/png"
    }
  ]
};
