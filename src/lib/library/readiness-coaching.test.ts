import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "src/lib/library/readiness.ts"), "utf8");

test("readiness validation remains focused on drill basics and phase content", () => {
  assert.equal(source.includes("missing-title"), true);
  assert.equal(source.includes("missing-drill-type"), true);
  assert.equal(source.includes("missing-camera-view"), true);
  assert.equal(source.includes("missing-phases"), true);
  assert.equal(source.includes("missing-phase-content"), true);
  assert.equal(source.includes("coachingProfile"), false);
});
