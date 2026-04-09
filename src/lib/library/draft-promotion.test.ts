import assert from "node:assert/strict";
import test from "node:test";
import { promoteHostedDraftToHostedLibrary, promoteLocalDraftToLocalLibrary } from "./draft-promotion.ts";
import type { DrillPackage } from "../schema/contracts.ts";

function makePackage(phaseCount: number, title: string): DrillPackage {
  return {
    manifest: {
      schemaVersion: "0.1.0",
      packageId: "pkg-1",
      packageVersion: "0.1.0",
      createdAtIso: "2026-04-08T00:00:00.000Z",
      updatedAtIso: "2026-04-08T00:00:00.000Z",
      compatibility: {
        androidMinVersion: "0.1.0",
        androidTargetContract: "0.1.0"
      },
      source: "web-studio"
    },
    drills: [
      {
        drillId: "drill-1",
        slug: "drill-1",
        title,
        drillType: "rep",
        difficulty: "beginner",
        tags: [],
        primaryView: "side",
        phases: Array.from({ length: phaseCount }, (_, i) => ({
          phaseId: `p-${i + 1}`,
          order: i + 1,
          name: `Phase ${i + 1}`,
          durationMs: 1000,
          poseSequence: [],
          assetRefs: []
        }))
      }
    ],
    assets: []
  };
}

test("signed-out local promotion preserves title and phase count", async () => {
  const pkg = makePackage(3, "Hello");

  const result = await promoteLocalDraftToLocalLibrary({
    loadDraftPackage: async () => pkg,
    saveToMyDrills: async (payload) => ({ title: payload.drills[0]?.title ?? "" }),
    deleteDraft: async () => undefined
  });

  assert.equal(result.title, "Hello");
  assert.equal(result.phaseCount, 3);
});

test("signed-in hosted promotion deletes source draft after save", async () => {
  const callOrder: string[] = [];
  const pkg = makePackage(2, "Cloud title");

  await promoteHostedDraftToHostedLibrary({
    loadDraftPackage: async () => {
      callOrder.push("load");
      return pkg;
    },
    saveToMyDrills: async () => {
      callOrder.push("save");
      return { title: "Cloud title" };
    },
    deleteDraft: async () => {
      callOrder.push("delete");
    }
  });

  assert.deepEqual(callOrder, ["load", "save", "delete"]);
});
