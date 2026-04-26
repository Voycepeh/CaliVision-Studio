import test from "node:test";
import assert from "node:assert/strict";
import { applyCoachingProfileSuggestions, deriveAutoCoachingProfile } from "./coaching-profile.ts";
import { toValidatedPackage } from "../package/validation/validate-package.ts";

function buildPackage(withProfile: boolean): unknown {
  return {
    manifest: {
      schemaVersion: "0.1.0",
      packageId: "pkg_coaching_profile_test",
      packageVersion: "0.1.0",
      createdAtIso: "2026-04-24T00:00:00.000Z",
      updatedAtIso: "2026-04-24T00:00:00.000Z",
      source: "web-studio",
      compatibility: {
        androidMinVersion: "1.2.0",
        androidTargetContract: "drill-package-0.1.0"
      }
    },
    drills: [
      {
        drillId: "drill_001",
        title: "Hold",
        drillType: "hold",
        difficulty: "beginner",
        tags: ["hold"],
        primaryView: "side",
        phases: [{ phaseId: "phase_1", order: 1, name: "Hold", durationMs: 1000, poseSequence: [], assetRefs: [] }],
        ...(withProfile
          ? {
              coachingProfile: {
                movementFamily: "handstand",
                rulesetId: "handstand_wall_hold_v1",
                supportType: "wall_assisted",
                primaryGoal: "balance",
                enabledVisualGuides: ["stack_line", "highlight_region"],
                cuePreference: "audio_optional"
              }
            }
          : {})
      }
    ],
    assets: []
  };
}

test("PortableDrill accepts optional coachingProfile", () => {
  const result = toValidatedPackage(buildPackage(true));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.drills[0]?.coachingProfile?.rulesetId, "handstand_wall_hold_v1");
});

test("old drills without coachingProfile still load", () => {
  const result = toValidatedPackage(buildPackage(false));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.drills[0]?.coachingProfile, undefined);
});

test("handstand movement selection suggests defaults only for empty fields", () => {
  const next = applyCoachingProfileSuggestions({
    current: { movementFamily: "plank", rulesetId: "custom" },
    partial: { movementFamily: "handstand" },
    drillType: "hold"
  });

  assert.equal(next.rulesetId, "custom");
  assert.equal(next.supportType, "wall_assisted");
  assert.equal(next.cuePreference, "audio_optional");
});

test("deriveAutoCoachingProfile keeps authored coachingProfile untouched", () => {
  const authored = {
    movementFamily: "custom",
    rulesetId: "custom",
    supportType: "floor",
    primaryGoal: "control",
    cuePreference: "visual_only" as const,
    enabledVisualGuides: ["ghost_pose" as const]
  };

  const next = deriveAutoCoachingProfile({
    profile: authored,
    drillType: "hold"
  });

  assert.deepEqual(next, authored);
});

test("deriveAutoCoachingProfile keeps side-view hold defaults generic when profile is missing", () => {
  const next = deriveAutoCoachingProfile({
    profile: undefined,
    drillType: "hold"
  });

  assert.equal(next.rulesetId, "generic_hold_v1");
  assert.equal(next.movementFamily, undefined);
  assert.equal(next.supportType, undefined);
  assert.equal(next.cuePreference, "visual_only");
});

test("deriveAutoCoachingProfile falls back to generic ruleset when metadata is limited", () => {
  const next = deriveAutoCoachingProfile({
    profile: undefined,
    drillType: "rep"
  });

  assert.equal(next.rulesetId, "generic_rep_v1");
  assert.equal(next.movementFamily, undefined);
});
