import test from "node:test";
import assert from "node:assert/strict";
import type { DrillPackage } from "../schema/contracts.ts";
import type { PublishableReadyVersion } from "./publish-finalization.ts";
import { finalizePublishedReadyVersion } from "./publish-finalization.ts";

function buildReadyPackage(input: { drillId: string; versionId: string; revision: number; drillType: "rep" | "hold"; phaseName?: string }): DrillPackage {
  return {
    manifest: {
      schemaVersion: "0.1.0",
      packageId: input.drillId,
      packageVersion: `0.1.${input.revision}`,
      createdAtIso: "2026-04-18T00:00:00.000Z",
      updatedAtIso: "2026-04-18T00:00:00.000Z",
      source: "web-studio",
      compatibility: { androidMinVersion: "1.0.0", androidTargetContract: "0.1.0" },
      versioning: {
        packageSlug: input.drillId,
        lineageId: input.drillId,
        versionId: input.versionId,
        revision: input.revision,
        draftStatus: "publish-ready"
      }
    },
    drills: [
      {
        drillId: input.drillId,
        title: "Published Drill",
        drillType: input.drillType,
        difficulty: "beginner",
        tags: [],
        primaryView: "front",
        phases: [
          {
            phaseId: "phase-1",
            order: 1,
            name: input.phaseName ?? "Phase One",
            durationMs: input.drillType === "hold" ? 2000 : 800,
            assetRefs: [],
            poseSequence: [{ poseId: "pose-1", timestampMs: 0, canvas: { coordinateSystem: "normalized-2d", widthRef: 1080, heightRef: 1920, view: "front" }, joints: { nose: { x: 0.5, y: 0.5, confidence: 0.9 } } }]
          }
        ]
      }
    ],
    assets: []
  };
}

function buildReadySnapshot(input: { packageJson: DrillPackage; versionId: string }): PublishableReadyVersion & Record<string, unknown> {
  return {
    versionId: input.versionId,
    drillId: input.packageJson.manifest.packageId,
    versionNumber: input.packageJson.manifest.versioning?.revision ?? 1,
    status: "ready",
    isPublished: false,
    createdAtIso: input.packageJson.manifest.createdAtIso,
    updatedAtIso: input.packageJson.manifest.updatedAtIso,
    title: input.packageJson.drills[0]?.title ?? "",
    packageJson: input.packageJson,
    source: "library",
    sourceId: input.versionId
  };
}

test("publish finalization auto-generates benchmark for ready rep drill", () => {
  const ready = buildReadySnapshot({
    versionId: "ready-v1",
    packageJson: buildReadyPackage({ drillId: "drill-1", versionId: "ready-v1", revision: 1, drillType: "rep" })
  });

  const published = finalizePublishedReadyVersion(ready);
  const publishedDrill = published.drills[0];

  assert.equal(published.manifest.publishing?.publishStatus, "published");
  assert.equal(Boolean(publishedDrill?.benchmark?.phaseSequence?.length), true);
  assert.equal(publishedDrill?.benchmark?.movementType, "rep");
  assert.equal(publishedDrill?.benchmark?.status, "ready");
  assert.equal(ready.packageJson.drills[0]?.benchmark, undefined);
});

test("publish finalization fails when benchmark generation cannot satisfy readiness requirements", () => {
  const broken = buildReadyPackage({ drillId: "drill-2", versionId: "ready-v1", revision: 1, drillType: "rep" });
  if (broken.drills[0]) {
    broken.drills[0].phases[0] = { ...broken.drills[0].phases[0], poseSequence: [] };
  }
  const ready = buildReadySnapshot({ versionId: "ready-v1", packageJson: broken });

  assert.throws(() => finalizePublishedReadyVersion(ready), /Publish blocked/);
  assert.equal(ready.packageJson.manifest.publishing?.publishStatus, undefined);
});

test("publish finalization generates version-scoped benchmarks for v1 and v2 independently", () => {
  const v1 = buildReadySnapshot({
    versionId: "ready-v1",
    packageJson: buildReadyPackage({ drillId: "drill-3", versionId: "ready-v1", revision: 1, drillType: "rep", phaseName: "Version One" })
  });
  const v2 = buildReadySnapshot({
    versionId: "ready-v2",
    packageJson: buildReadyPackage({ drillId: "drill-3", versionId: "ready-v2", revision: 2, drillType: "rep", phaseName: "Version Two" })
  });

  const publishedV1 = finalizePublishedReadyVersion(v1);
  const publishedV2 = finalizePublishedReadyVersion(v2);

  assert.equal(publishedV1.manifest.versioning?.versionId, "ready-v1");
  assert.equal(publishedV2.manifest.versioning?.versionId, "ready-v2");
  assert.equal(publishedV1.drills[0]?.benchmark?.phaseSequence?.[0]?.label, "Version One");
  assert.equal(publishedV2.drills[0]?.benchmark?.phaseSequence?.[0]?.label, "Version Two");
});

test("publish finalization generates hold benchmark timing from released authored data", () => {
  const ready = buildReadySnapshot({
    versionId: "ready-hold-v1",
    packageJson: buildReadyPackage({ drillId: "drill-hold", versionId: "ready-hold-v1", revision: 1, drillType: "hold" })
  });

  const published = finalizePublishedReadyVersion(ready);
  assert.equal(published.drills[0]?.benchmark?.movementType, "hold");
  assert.equal(published.drills[0]?.benchmark?.timing?.targetHoldDurationMs, 2000);
});
