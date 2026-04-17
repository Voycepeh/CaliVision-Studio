import assert from "node:assert/strict";
import test from "node:test";
import { getDrillBenchmark, getNormalizedBenchmarkPhases, hasBenchmark } from "../../drills/benchmark.ts";
import {
  normalizePortableDrill,
  normalizePortableDrillPackage,
  parsePackageJson,
  toValidatedPackage
} from "./validate-package.ts";
import type { DrillPackage, PortableDrill } from "../../schema/contracts.ts";

function makeBaseDrill(overrides: Partial<PortableDrill> = {}): PortableDrill {
  return {
    drillId: "drill_benchmark_base",
    title: "Benchmark Base",
    drillType: "rep",
    difficulty: "beginner",
    tags: ["test"],
    primaryView: "front",
    phases: [
      { phaseId: "phase_a", order: 1, name: "Phase A", durationMs: 600, poseSequence: [], assetRefs: [] },
      { phaseId: "phase_b", order: 2, name: "Phase B", durationMs: 500, poseSequence: [], assetRefs: [] }
    ],
    ...overrides
  };
}

function makeBasePackage(drill: PortableDrill): DrillPackage {
  return {
    manifest: {
      schemaVersion: "0.1.0",
      packageId: "pkg_benchmark_test",
      packageVersion: "0.1.0",
      createdAtIso: "2026-04-17T00:00:00.000Z",
      updatedAtIso: "2026-04-17T00:00:00.000Z",
      source: "web-studio",
      compatibility: {
        androidMinVersion: "1.2.0",
        androidTargetContract: "drill-package-0.1.0"
      }
    },
    drills: [drill],
    assets: []
  };
}

test("legacy drill with no benchmark normalizes safely", () => {
  const drill = makeBaseDrill();
  const normalized = normalizePortableDrill(drill);
  assert.equal(normalized.benchmark, null);
  assert.equal(hasBenchmark(normalized), false);
  assert.equal(getDrillBenchmark(normalized), null);
});

test("partial benchmark normalizes into stable shape", () => {
  const drill = makeBaseDrill({
    benchmark: {
      sourceType: "seeded",
      phaseSequence: [{ key: "", order: 0 }]
    }
  });

  const normalized = normalizePortableDrill(drill);
  assert.equal(normalized.benchmark?.sourceType, "seeded");
  assert.equal(normalized.benchmark?.movementType, "rep");
  assert.equal(normalized.benchmark?.cameraView, "front");
  assert.equal(normalized.benchmark?.status, "draft");
  assert.equal(normalized.benchmark?.phaseSequence?.[0]?.key, "benchmark_phase_1");
  assert.equal(normalized.benchmark?.phaseSequence?.[0]?.order, 1);
});

test("benchmark phase sequence helper returns normalized ordered phases", () => {
  const drill = makeBaseDrill({
    benchmark: {
      sourceType: "reference_pose_sequence",
      phaseSequence: [
        { key: "phase_b", order: 2, targetDurationMs: 500 },
        { key: "phase_a", order: 1, targetDurationMs: 600 }
      ]
    }
  });

  const normalized = normalizePortableDrill(drill);
  const phases = getNormalizedBenchmarkPhases(normalized);

  assert.equal(phases.length, 2);
  assert.equal(phases[0]?.key, "phase_a");
  assert.equal(phases[0]?.order, 1);
  assert.equal(phases[1]?.key, "phase_b");
  assert.equal(phases[1]?.order, 2);
});

test("round-trip serialization preserves benchmark payload", () => {
  const drill = makeBaseDrill({
    benchmark: {
      sourceType: "reference_video",
      label: "Video baseline",
      movementType: "rep",
      cameraView: "front",
      phaseSequence: [{ key: "phase_a", order: 1, targetDurationMs: 600 }],
      media: { referenceVideoUri: "https://example.invalid/video.mp4" },
      status: "ready"
    }
  });
  const pkg = normalizePortableDrillPackage(makeBasePackage(drill));
  const json = JSON.stringify(pkg);
  const parsed = parsePackageJson(json);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const validated = toValidatedPackage(parsed.parsed);
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  assert.equal(validated.value.drills[0]?.benchmark?.sourceType, "reference_video");
  assert.equal(validated.value.drills[0]?.benchmark?.media?.referenceVideoUri, "https://example.invalid/video.mp4");
  assert.equal(validated.value.drills[0]?.benchmark?.status, "ready");
});

test("normalization remains compatible for local/hosted/public-style drill payloads", () => {
  const payloads: PortableDrill[] = [
    makeBaseDrill(),
    makeBaseDrill({
      drillId: "seeded_drill",
      benchmark: { sourceType: "seeded", phaseSequence: [{ key: "phase_a", order: 1 }] }
    }),
    makeBaseDrill({
      drillId: "public_drill",
      benchmark: { sourceType: "reference_video", media: { referenceVideoAssetId: "asset_ref_1" } }
    })
  ];

  for (const drill of payloads) {
    const normalized = normalizePortableDrill(drill);
    assert.ok(Array.isArray(normalized.phases));
    assert.ok(normalized.analysis);
    assert.equal(normalized.benchmark === null || typeof normalized.benchmark === "object", true);
  }
  assert.ok(payloads.some((drill) => normalizePortableDrill(drill).benchmark !== null));
  assert.ok(payloads.some((drill) => normalizePortableDrill(drill).benchmark === null));
});
