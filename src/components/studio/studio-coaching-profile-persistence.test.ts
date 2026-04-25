import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyCoachingProfileSuggestions } from "../../lib/analysis/coaching-profile.ts";
import type { DrillPackage } from "../../lib/schema/contracts.ts";
import { deriveCoachingProfileFormState } from "./coaching-profile-form-state.ts";

function createBasePackage(): DrillPackage {
  return {
    manifest: {
      schemaVersion: "0.1.0",
      packageId: "drill-coaching-profile",
      packageVersion: "0.1.0",
      createdAtIso: "2026-04-01T00:00:00.000Z",
      updatedAtIso: "2026-04-01T00:00:00.000Z",
      source: "web-studio",
      compatibility: { androidMinVersion: "1.0.0", androidTargetContract: "0.1.0" }
    },
    drills: [
      {
        drillId: "drill-coaching-profile",
        title: "Profile persistence",
        description: "Verify coaching profile save/load behavior.",
        drillType: "rep",
        difficulty: "beginner",
        tags: [],
        primaryView: "front",
        phases: [
          {
            phaseId: "phase-1",
            order: 1,
            name: "Start",
            durationMs: 600,
            assetRefs: [],
            poseSequence: []
          }
        ]
      }
    ],
    assets: []
  };
}

function getPrimaryDrill(pkg: DrillPackage) {
  const drill = pkg.drills[0];
  assert.ok(drill);
  return drill;
}

function applyEdit(
  sourcePackage: DrillPackage,
  workingPackage: DrillPackage,
  partial: Parameters<typeof applyCoachingProfileSuggestions>[0]["partial"]
): { nextPackage: DrillPackage; isDirty: boolean } {
  const nextPackage = structuredClone(workingPackage);
  const drill = getPrimaryDrill(nextPackage);
  drill.coachingProfile = applyCoachingProfileSuggestions({
    current: drill.coachingProfile,
    partial,
    drillType: drill.drillType
  });
  return {
    nextPackage,
    isDirty: JSON.stringify(nextPackage) !== JSON.stringify(sourcePackage)
  };
}

test("coaching profile edits mark the selected package dirty after each Studio-style edit", () => {
  const sourcePackage = createBasePackage();
  let workingPackage = structuredClone(sourcePackage);

  let result = applyEdit(sourcePackage, workingPackage, { movementFamily: "custom" });
  assert.equal(result.isDirty, true);
  assert.equal(getPrimaryDrill(result.nextPackage).coachingProfile?.movementFamily, "custom");
  workingPackage = result.nextPackage;

  result = applyEdit(sourcePackage, workingPackage, { rulesetId: "generic_rep_v1" });
  assert.equal(result.isDirty, true);
  assert.equal(getPrimaryDrill(result.nextPackage).coachingProfile?.rulesetId, "generic_rep_v1");
  workingPackage = result.nextPackage;

  result = applyEdit(sourcePackage, workingPackage, { supportType: "floor" });
  assert.equal(result.isDirty, true);
  assert.equal(getPrimaryDrill(result.nextPackage).coachingProfile?.supportType, "floor");
  workingPackage = result.nextPackage;

  result = applyEdit(sourcePackage, workingPackage, { primaryGoal: "control" });
  assert.equal(result.isDirty, true);
  assert.equal(getPrimaryDrill(result.nextPackage).coachingProfile?.primaryGoal, "control");
  workingPackage = result.nextPackage;

  result = applyEdit(sourcePackage, workingPackage, { cuePreference: "visual_only" });
  assert.equal(result.isDirty, true);
  assert.equal(getPrimaryDrill(result.nextPackage).coachingProfile?.cuePreference, "visual_only");
  workingPackage = result.nextPackage;

  result = applyEdit(sourcePackage, workingPackage, { enabledVisualGuides: ["ghost_pose", "correction_arrow", "metric_badge"] });
  assert.equal(result.isDirty, true);
  assert.deepEqual(getPrimaryDrill(result.nextPackage).coachingProfile?.enabledVisualGuides, ["ghost_pose", "correction_arrow", "metric_badge"]);
});

test("local save payload and reopened draft preserve coaching profile values for Studio metadata editor", () => {
  const sourcePackage = createBasePackage();
  const { nextPackage } = applyEdit(sourcePackage, sourcePackage, {
    movementFamily: "custom",
    rulesetId: "generic_rep_v1",
    supportType: "floor",
    primaryGoal: "control",
    cuePreference: "visual_only",
    enabledVisualGuides: ["ghost_pose", "correction_arrow", "metric_badge"]
  });

  const localSavePayload = {
    draftId: "draft-1",
    sourceLabel: "authored-local",
    packageJson: nextPackage,
    assetsById: {} as Record<string, Blob>
  };

  assert.deepEqual(getPrimaryDrill(localSavePayload.packageJson)?.coachingProfile, {
    movementFamily: "custom",
    rulesetId: "generic_rep_v1",
    supportType: "floor",
    primaryGoal: "control",
    cuePreference: "visual_only",
    enabledVisualGuides: ["ghost_pose", "correction_arrow", "metric_badge"]
  });

  const reopenedDrill = getPrimaryDrill(structuredClone(localSavePayload.packageJson));
  assert.ok(reopenedDrill);
  const formState = deriveCoachingProfileFormState(reopenedDrill.coachingProfile);

  assert.equal(formState.movementFamily, "custom");
  assert.equal(formState.rulesetId, "generic_rep_v1");
  assert.equal(formState.supportType, "floor");
  assert.equal(formState.primaryGoal, "control");
  assert.equal(formState.cuePreference, "visual_only");
  assert.deepEqual(formState.enabledVisualGuides, ["ghost_pose", "correction_arrow", "metric_badge"]);
});

test("cloud save path continues to post selectedPackage.workingPackage (minimal regression check)", () => {
  const studioStatePath = join(process.cwd(), "src/components/studio/StudioState.tsx");
  const studioStateSource = readFileSync(studioStatePath, "utf8");
  assert.equal(studioStateSource.includes("upsertHostedLibraryItem(session, selectedPackage.workingPackage)"), true);
  assert.equal(studioStateSource.includes("if (!selectedPackage?.isDirty)"), true);
});
