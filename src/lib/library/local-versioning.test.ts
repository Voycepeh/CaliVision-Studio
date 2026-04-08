import assert from "node:assert/strict";
import test from "node:test";
import { normalizeReadyPackageFromDraft, reconcileLocalVersionSnapshots } from "./local-versioning.ts";
import type { DrillPackage } from "../schema/contracts.ts";

function makePackage(input: { packageId: string; packageVersion: string; versionId: string; revision: number; draftStatus: "draft" | "publish-ready" }): DrillPackage {
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
        drillType: "rep",
        difficulty: "beginner",
        tags: [],
        defaultView: "side",
        phases: []
      }
    ],
    assets: []
  };
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
