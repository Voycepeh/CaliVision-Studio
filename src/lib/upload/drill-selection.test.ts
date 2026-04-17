import test from "node:test";
import assert from "node:assert/strict";
import { createUploadJobDrillSelection, resolveSelectedDrillKey } from "./drill-selection.ts";

test("resolveSelectedDrillKey prefers current selection when available", () => {
  const options = [{ key: "seeded:a" }, { key: "local:b" }];
  assert.equal(resolveSelectedDrillKey(options, "local:b", "seeded:a"), "local:b");
});

test("resolveSelectedDrillKey falls back to stored selection", () => {
  const options = [{ key: "seeded:a" }, { key: "local:b" }];
  assert.equal(resolveSelectedDrillKey(options, null, "local:b"), "local:b");
});

test("resolveSelectedDrillKey falls back to first option when preferred key is missing", () => {
  const options = [{ key: "seeded:a" }, { key: "local:b" }];
  assert.equal(resolveSelectedDrillKey(options, "hosted:c", "hosted:c"), "seeded:a");
});

test("createUploadJobDrillSelection snapshots selected drill binding for queued jobs", () => {
  const selectedDrill: Parameters<typeof createUploadJobDrillSelection>[0]["selectedDrill"] = {
    key: "local:draft-1:drill-1",
    sourceKind: "local" as const,
    sourceId: "draft-1",
    packageVersion: "0.4.0",
    drill: {
      drillId: "drill-1",
      slug: "drill-1",
      title: "Selected Drill",
      drillType: "rep",
      difficulty: "beginner",
      tags: [],
      primaryView: "side",
      phases: []
    }
  };

  const snapshot = createUploadJobDrillSelection({ selectedDrill });
  assert.equal(snapshot.mode, "drill");
  assert.equal(snapshot.drill.drillId, "drill-1");
  assert.equal(snapshot.drillBinding.sourceKind, "local");
  assert.equal(snapshot.drillBinding.sourceId, "draft-1");
  assert.equal(snapshot.drillVersion, "0.4.0");
  assert.equal(snapshot.cameraView, "side");
});

test("createUploadJobDrillSelection defaults to freestyle mode when no drill is selected", () => {
  const snapshot = createUploadJobDrillSelection({ selectedDrill: null });
  assert.equal(snapshot.mode, "freestyle");
  assert.equal(snapshot.drill, undefined);
  assert.equal(snapshot.drillBinding.sourceKind, "freestyle");
});

test("createUploadJobDrillSelection keeps public drill reference details", () => {
  const selectedDrill: Parameters<typeof createUploadJobDrillSelection>[0]["selectedDrill"] = {
    key: "exchange:pub-123:drill-77",
    sourceKind: "exchange",
    sourceId: "pub-123",
    packageVersion: "1.2.0",
    drill: {
      drillId: "drill-77",
      slug: "drill-77",
      title: "Public Drill 77",
      drillType: "rep",
      difficulty: "intermediate",
      tags: [],
      primaryView: "front",
      phases: []
    }
  };

  const snapshot = createUploadJobDrillSelection({ selectedDrill });
  assert.equal(snapshot.mode, "drill");
  assert.equal(snapshot.drillBinding.sourceKind, "exchange");
  assert.equal(snapshot.drillBinding.sourceId, "pub-123");
  assert.equal(snapshot.drillBinding.sourceLabel, "exchange:pub-123:drill-77");
});
