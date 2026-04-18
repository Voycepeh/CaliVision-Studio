import assert from "node:assert/strict";
import test from "node:test";
import { normalizeReadyPackageFromDraft, reconcileLocalVersionSnapshots } from "./local-versioning.ts";
import type { DrillPackage } from "../schema/contracts.ts";

function makePackage(input: {
  packageId: string;
  packageVersion: string;
  versionId: string;
  revision: number;
  draftStatus: "draft" | "publish-ready";
  drillType?: "rep" | "hold";
  phases?: DrillPackage["drills"][number]["phases"];
  benchmark?: DrillPackage["drills"][number]["benchmark"];
}): DrillPackage {
  return {
    manifest: {
      schemaVersion: "0.1.0",
      packageId: input.packageId,
      packageVersion: input.packageVersion,
      createdAtIso: "2026-04-08T00:00:00.000Z",
      updatedAtIso: "2026-04-08T00:00:00.000Z",
      compatibility: {
        androidMinVersion: "0.1.0",
        androidTargetContract: "0.1.0"
      },
      source: "web-studio",
      versioning: {
        packageSlug: input.packageId,
        lineageId: input.packageId,
        versionId: input.versionId,
        revision: input.revision,
        draftStatus: input.draftStatus
      }
    },
    drills: [
      {
        drillId: input.packageId,
        slug: input.packageId,
        title: "New drill",
        drillType: input.drillType ?? "rep",
        difficulty: "beginner",
        tags: [],
        primaryView: "side",
        phases: input.phases ?? [],
        benchmark: input.benchmark
      }
    ],
    assets: []
  };
}

function makeAuthoredPhases(input: { drillType: "rep" | "hold" }): DrillPackage["drills"][number]["phases"] {
  if (input.drillType === "hold") {
    return [
      {
        phaseId: "hold-1",
        order: 1,
        name: "Hold",
        durationMs: 2200,
        summary: "Static hold",
        poseSequence: [{ poseId: "hold-pose-1", timestampMs: 0, canvas: { coordinateSystem: "normalized-2d", widthRef: 1080, heightRef: 1920, view: "side" }, joints: {} }],
        assetRefs: []
      }
    ];
  }

  return [
    {
      phaseId: "rep-1",
      order: 1,
      name: "Down",
      durationMs: 800,
      poseSequence: [{ poseId: "rep-pose-1", timestampMs: 0, canvas: { coordinateSystem: "normalized-2d", widthRef: 1080, heightRef: 1920, view: "side" }, joints: {} }],
      assetRefs: []
    },
    {
      phaseId: "rep-2",
      order: 2,
      name: "Up",
      durationMs: 700,
      poseSequence: [{ poseId: "rep-pose-2", timestampMs: 0, canvas: { coordinateSystem: "normalized-2d", widthRef: 1080, heightRef: 1920, view: "side" }, joints: {} }],
      assetRefs: []
    }
  ];
}

function makeSnapshot(input: { drillId: string; versionId: string; versionNumber: number; status: "draft" | "ready"; updatedAtIso: string }) {
  const pkg = makePackage({ packageId: input.drillId, packageVersion: `0.1.${input.versionNumber}`, versionId: input.versionId, revision: input.versionNumber, draftStatus: input.status === "draft" ? "draft" : "publish-ready" });
  return {
    versionId: input.versionId,
    drillId: input.drillId,
    versionNumber: input.versionNumber,
    status: input.status,
    isPublished: false,
    createdAtIso: input.updatedAtIso,
    updatedAtIso: input.updatedAtIso,
    title: "Drill",
    packageJson: pkg,
    source: "draft",
    sourceId: input.versionId
  };
}

test("reconcileLocalVersionSnapshots keeps newest stale duplicate only", () => {
  const oldDraft = makeSnapshot({ drillId: "drill-1", versionId: "draft-old", versionNumber: 1, status: "draft", updatedAtIso: "2026-04-08T01:00:00.000Z" });
  const newDraft = makeSnapshot({ drillId: "drill-1", versionId: "draft-new", versionNumber: 1, status: "draft", updatedAtIso: "2026-04-08T02:00:00.000Z" });

  const reconciled = reconcileLocalVersionSnapshots([oldDraft, newDraft]);

  assert.equal(reconciled.length, 1);
  assert.equal(reconciled[0]?.versionId, "draft-new");
});

test("reconcileLocalVersionSnapshots preserves editable draft and ready lineage", () => {
  const ready = makeSnapshot({ drillId: "drill-2", versionId: "ready-v2", versionNumber: 2, status: "ready", updatedAtIso: "2026-04-08T03:00:00.000Z" });
  const draft = makeSnapshot({ drillId: "drill-2", versionId: "draft-v3", versionNumber: 3, status: "draft", updatedAtIso: "2026-04-08T04:00:00.000Z" });

  const reconciled = reconcileLocalVersionSnapshots([ready, draft]);

  assert.equal(reconciled.length, 2);
  assert.ok(reconciled.find((item) => item.status === "draft" && item.versionId === "draft-v3"));
  assert.ok(reconciled.find((item) => item.status === "ready" && item.versionId === "ready-v2"));
});

test("reconcileLocalVersionSnapshots normalizes legacy same-version draft to next version", () => {
  const ready = makeSnapshot({ drillId: "drill-3", versionId: "ready-v1", versionNumber: 1, status: "ready", updatedAtIso: "2026-04-08T03:00:00.000Z" });
  const legacyDraft = makeSnapshot({ drillId: "drill-3", versionId: "draft-v1", versionNumber: 1, status: "draft", updatedAtIso: "2026-04-08T04:00:00.000Z" });

  const reconciled = reconcileLocalVersionSnapshots([ready, legacyDraft]);
  const draft = reconciled.find((item) => item.status === "draft");

  assert.ok(draft);
  assert.equal(draft?.versionNumber, 2);
});

test("normalizeReadyPackageFromDraft bumps package/version identity when draft collides", () => {
  const draft = makePackage({ packageId: "drill-a", packageVersion: "0.1.0", versionId: "draft-a", revision: 1, draftStatus: "draft" });
  const normalized = normalizeReadyPackageFromDraft({
    draftPackage: draft,
    maxReadyVersionNumber: 1,
    maxReadyPackageVersion: "0.1.0"
  });

  assert.equal(normalized.manifest.packageVersion, "0.1.1");
  assert.equal(normalized.manifest.versioning?.revision, 2);
  assert.equal(normalized.manifest.versioning?.versionId, "drill-a@0.1.1");
  assert.equal(normalized.manifest.versioning?.draftStatus, "publish-ready");
});

test("normalizeReadyPackageFromDraft bootstraps benchmark for new rep drills with authored phases", () => {
  const draft = makePackage({
    packageId: "rep-drill",
    packageVersion: "0.1.0",
    versionId: "draft-rep",
    revision: 1,
    draftStatus: "draft",
    drillType: "rep",
    phases: makeAuthoredPhases({ drillType: "rep" })
  });

  const normalized = normalizeReadyPackageFromDraft({
    draftPackage: draft,
    maxReadyVersionNumber: 0
  });

  assert.equal(normalized.drills[0]?.benchmark?.sourceType, "reference_pose_sequence");
  assert.equal(normalized.drills[0]?.benchmark?.phaseSequence?.length, 2);
  assert.equal(normalized.drills[0]?.benchmark?.timing?.expectedRepDurationMs, 1500);
});

test("normalizeReadyPackageFromDraft bootstraps benchmark for new hold drills with authored phases", () => {
  const draft = makePackage({
    packageId: "hold-drill",
    packageVersion: "0.1.0",
    versionId: "draft-hold",
    revision: 1,
    draftStatus: "draft",
    drillType: "hold",
    phases: makeAuthoredPhases({ drillType: "hold" })
  });

  const normalized = normalizeReadyPackageFromDraft({
    draftPackage: draft,
    maxReadyVersionNumber: 0
  });

  assert.equal(normalized.drills[0]?.benchmark?.movementType, "hold");
  assert.equal(normalized.drills[0]?.benchmark?.phaseSequence?.length, 1);
  assert.equal(normalized.drills[0]?.benchmark?.timing?.targetHoldDurationMs, 2200);
});

test("normalizeReadyPackageFromDraft preserves existing usable benchmarks", () => {
  const draft = makePackage({
    packageId: "preserve-drill",
    packageVersion: "0.1.0",
    versionId: "draft-preserve",
    revision: 1,
    draftStatus: "draft",
    drillType: "rep",
    phases: makeAuthoredPhases({ drillType: "rep" }),
    benchmark: {
      sourceType: "reference_pose_sequence",
      movementType: "rep",
      cameraView: "front",
      status: "ready",
      phaseSequence: [{ key: "existing-1", order: 1, label: "Existing phase", targetDurationMs: 500 }]
    }
  });

  const normalized = normalizeReadyPackageFromDraft({
    draftPackage: draft,
    maxReadyVersionNumber: 0
  });

  assert.equal(normalized.drills[0]?.benchmark?.phaseSequence?.[0]?.key, "existing-1");
  assert.equal(normalized.drills[0]?.benchmark?.phaseSequence?.length, 1);
});
