import assert from "node:assert/strict";
import test from "node:test";
import { getPrimaryDrillDisplayMetadata } from "./display-metadata.ts";
import type { DrillPackage } from "../schema/contracts.ts";

function buildPackage(): DrillPackage {
  return {
    manifest: {
      schemaVersion: "0.1.0",
      packageId: "sample-package",
      packageVersion: "0.1.0",
      createdAtIso: "2026-04-08T00:00:00.000Z",
      updatedAtIso: "2026-04-08T00:00:00.000Z",
      compatibility: { androidMinVersion: "0.1.0", androidTargetContract: "0.1.0" },
      source: "web-studio"
    },
    drills: [
      {
        drillId: "d-1",
        slug: "hello",
        title: "Hello",
        drillType: "rep",
        difficulty: "beginner",
        tags: [],
        defaultView: "side",
        phases: [
          { phaseId: "p1", order: 1, title: "One", durationMs: 1000, poseSequence: [], assetRefs: [] },
          { phaseId: "p2", order: 2, title: "Two", durationMs: 1000, poseSequence: [], assetRefs: [] },
          { phaseId: "p3", order: 3, title: "Three", durationMs: 1000, poseSequence: [], assetRefs: [] }
        ]
      },
      {
        drillId: "d-2",
        slug: "unused",
        title: "Unused",
        drillType: "rep",
        difficulty: "beginner",
        tags: [],
        defaultView: "side",
        phases: [
          { phaseId: "x1", order: 1, title: "X", durationMs: 1000, poseSequence: [], assetRefs: [] },
          { phaseId: "x2", order: 2, title: "Y", durationMs: 1000, poseSequence: [], assetRefs: [] },
          { phaseId: "x3", order: 3, title: "Z", durationMs: 1000, poseSequence: [], assetRefs: [] },
          { phaseId: "x4", order: 4, title: "W", durationMs: 1000, poseSequence: [], assetRefs: [] }
        ]
      }
    ],
    assets: []
  };
}

test("uses primary drill title and phase count", () => {
  const metadata = getPrimaryDrillDisplayMetadata(buildPackage());
  assert.equal(metadata.title, "Hello");
  assert.equal(metadata.phaseCount, 3);
});
