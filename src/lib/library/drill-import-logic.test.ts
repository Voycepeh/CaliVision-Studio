import assert from "node:assert/strict";
import test from "node:test";
import { decideDrillImportOutcome, hasDuplicatePackageIdentity } from "./drill-import-logic.ts";
import type { DrillPackage } from "../schema/contracts.ts";

function makePackage(overrides: { packageId: string; revision: number; title: string }): DrillPackage {
  const now = new Date().toISOString();
  return {
    manifest: {
      schemaVersion: "0.1.0",
      packageId: overrides.packageId,
      packageVersion: `0.1.${overrides.revision}`,
      createdAtIso: now,
      updatedAtIso: now,
      source: "web-studio",
      compatibility: {
        androidMinVersion: "1.2.0",
        androidTargetContract: "drill-package-0.1.0"
      },
      versioning: {
        packageSlug: overrides.packageId,
        lineageId: `${overrides.packageId}-lineage`,
        versionId: `${overrides.packageId}-v${overrides.revision}`,
        revision: overrides.revision,
        draftStatus: "publish-ready"
      }
    },
    drills: [
      {
        drillId: overrides.packageId,
        slug: overrides.packageId,
        title: overrides.title,
        drillType: "rep",
        difficulty: "beginner",
        tags: [],
        defaultView: "front",
        phases: []
      }
    ],
    assets: []
  };
}

test("signed-out import of a new drill resolves to browser imported", () => {
  const pkg = makePackage({ packageId: "drill-local-new", revision: 1, title: "Local New" });
  const result = decideDrillImportOutcome({ packageJson: pkg, workspace: "browser", targetWorkspacePackages: [] });
  assert.equal(result.workspace, "browser");
  assert.equal(result.status, "imported");
});

test("signed-out duplicate import resolves to browser duplicate", () => {
  const pkg = makePackage({ packageId: "drill-local-dup", revision: 1, title: "Local Dup" });
  const result = decideDrillImportOutcome({ packageJson: pkg, workspace: "browser", targetWorkspacePackages: [pkg] });
  assert.equal(result.status, "duplicate");
  assert.equal(result.workspace, "browser");
});

test("signed-in import of a new drill resolves to cloud imported", () => {
  const pkg = makePackage({ packageId: "drill-cloud-new", revision: 1, title: "Cloud New" });
  const result = decideDrillImportOutcome({ packageJson: pkg, workspace: "cloud", targetWorkspacePackages: [] });
  assert.equal(result.status, "imported");
  assert.equal(result.workspace, "cloud");
});

test("signed-in cloud mode flags local-only match when cloud has no copy", () => {
  const pkg = makePackage({ packageId: "drill-local-only", revision: 2, title: "Local Only" });
  const result = decideDrillImportOutcome({
    packageJson: pkg,
    workspace: "cloud",
    targetWorkspacePackages: [],
    otherWorkspacePackages: [pkg]
  });
  assert.equal(result.status, "imported");
  assert.equal(result.matchedOtherWorkspace, true);
});

test("duplicate identity detection uses lineage/version identity, not title", () => {
  const original = makePackage({ packageId: "drill-id", revision: 4, title: "Name A" });
  const renamed = makePackage({ packageId: "drill-id", revision: 4, title: "Different Name" });
  assert.equal(hasDuplicatePackageIdentity(original, [renamed]), true);
});
