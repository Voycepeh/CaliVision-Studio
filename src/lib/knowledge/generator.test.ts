import test from "node:test";
import assert from "node:assert/strict";
import { buildDrillKnowledgeDocument, suggestRelatedDrillIds } from "./generator.ts";
import type { DrillPackage } from "../schema/contracts.ts";

function createPackage(overrides?: Partial<DrillPackage>): DrillPackage {
  return {
    manifest: {
      schemaVersion: "0.1.0",
      packageId: "sample-drill",
      packageVersion: "0.1.0",
      createdAtIso: "2026-04-09T00:00:00.000Z",
      updatedAtIso: "2026-04-09T00:00:00.000Z",
      source: "web-studio",
      compatibility: {
        androidMinVersion: "1.0.0",
        androidTargetContract: "0.1.0"
      },
      versioning: {
        packageSlug: "sample-drill",
        versionId: "sample-drill@0.1.0",
        revision: 1,
        lineageId: "sample-drill",
        draftStatus: "draft"
      }
    },
    drills: [
      {
        drillId: "sample-drill",
        title: "Sample Drill",
        drillType: "rep",
        description: "",
        difficulty: "beginner",
        tags: ["bodyweight"],
        primaryView: "front",
        phases: [
          {
            phaseId: "phase-start",
            order: 1,
            name: "Start",
            durationMs: 800,
            poseSequence: [],
            assetRefs: []
          },
          {
            phaseId: "phase-end",
            order: 2,
            name: "End",
            durationMs: 800,
            poseSequence: [],
            assetRefs: []
          }
        ],
        analysis: {
          measurementType: "rep",
          orderedPhaseSequence: ["phase-start", "phase-end"],
          criticalPhaseIds: ["phase-start", "phase-end"],
          allowedPhaseSkips: [],
          minimumConfirmationFrames: 2,
          exitGraceFrames: 2,
          minimumRepDurationMs: 500,
          cooldownMs: 300,
          entryConfirmationFrames: 2,
          minimumHoldDurationMs: 0
        }
      }
    ],
    assets: [],
    ...overrides
  };
}

test("buildDrillKnowledgeDocument derives stable sections from package data", () => {
  const pkg = createPackage();
  pkg.manifest.packageId = "drill-squat-1";
  pkg.manifest.packageVersion = "0.3.0";
  pkg.manifest.updatedAtIso = "2026-04-09T00:00:00.000Z";
  pkg.manifest.versioning = {
    packageSlug: "drill-squat-1",
    versionId: "drill-squat-1@0.3.0",
    revision: 3,
    lineageId: "drill-squat-1",
    draftStatus: "publish-ready"
  };
  pkg.drills[0].drillId = "drill-squat-1";
  pkg.drills[0].title = "Bodyweight Squat";
  pkg.drills[0].description = "Practice controlled bodyweight squats.";
  pkg.drills[0].tags = ["squat", "bodyweight"];
  pkg.drills[0].primaryView = "side";

  const knowledge = buildDrillKnowledgeDocument({ packageJson: pkg });

  assert.equal(knowledge.id, "knowledge:drill-squat-1:drill-squat-1@0.3.0");
  assert.equal(knowledge.title, "Bodyweight Squat");
  assert.equal(knowledge.summary, "Practice controlled bodyweight squats.");
  assert.deepEqual(knowledge.movementFamily, ["squat"]);
  assert.deepEqual(knowledge.equipment, ["bodyweight"]);
  assert.match(knowledge.orientationNotes, /side view/i);
  assert.equal(knowledge.phaseOverview.length, pkg.drills[0].phases.length);
  assert.ok(knowledge.sourceRefs.some((ref) => ref.sourceType === "published_version"));
});

test("suggestRelatedDrillIds returns deterministic ranked matches", () => {
  const base = createPackage();
  base.manifest.packageId = "base-drill";
  base.drills[0].drillId = "base-drill";
  base.drills[0].title = "Base Squat";
  base.drills[0].tags = ["squat", "bodyweight"];

  const near = createPackage();
  near.manifest.packageId = "near-drill";
  near.drills[0].drillId = "near-drill";
  near.drills[0].title = "Near Squat";
  near.drills[0].tags = ["squat"];

  const far = createPackage();
  far.manifest.packageId = "far-drill";
  far.drills[0].drillId = "far-drill";
  far.drills[0].title = "Mobility Flow";
  far.drills[0].tags = ["mobility"];

  const related = suggestRelatedDrillIds(base, [near, far]);
  assert.deepEqual(related, ["near-drill"]);
});
