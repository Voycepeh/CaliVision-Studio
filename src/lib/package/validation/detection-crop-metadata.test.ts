import assert from "node:assert/strict";
import test from "node:test";

import type { DrillPackage, PortableDrill } from "../../schema/contracts.ts";
import { normalizePortableDrillPackage } from "./validate-package.ts";

function makePackage(drill: PortableDrill): DrillPackage {
  return {
    manifest: {
      schemaVersion: "0.1.0",
      packageId: "pkg_detection_crop_test",
      packageVersion: "0.1.0",
      createdAtIso: "2026-04-27T00:00:00.000Z",
      updatedAtIso: "2026-04-27T00:00:00.000Z",
      source: "web-studio",
      compatibility: {
        androidMinVersion: "1.2.0",
        androidTargetContract: "drill-package-0.1.0"
      }
    },
    drills: [drill],
    assets: []
  };
}

test("normalizePortableDrillPackage preserves phase detection crop metadata", () => {
  const drill: PortableDrill = {
    drillId: "drill_detection_crop",
    title: "Detection Crop Drill",
    drillType: "rep",
    difficulty: "beginner",
    tags: [],
    primaryView: "front",
    phases: [
      {
        phaseId: "phase_1",
        order: 1,
        name: "Phase 1",
        durationMs: 800,
        poseSequence: [],
        assetRefs: [],
        detectionCrop: {
          centerX: 0.31,
          centerY: 0.76,
          zoom: 1.8
        }
      }
    ]
  };

  const normalized = normalizePortableDrillPackage(makePackage(drill));
  const normalizedCrop = normalized.drills[0]?.phases[0]?.detectionCrop;

  assert.deepEqual(normalizedCrop, {
    centerX: 0.31,
    centerY: 0.76,
    zoom: 1.8
  });
});
