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

test("readiness validation copy stays product-facing and actionable", () => {
  assert.equal(source.includes("Choose whether this is a hold or rep drill."), true);
  assert.equal(source.includes("Choose the camera view users should record from."), true);
  assert.equal(source.includes("Add at least one phase."), true);
  assert.equal(source.includes("Add a pose reference for"), true);
  assert.equal(source.includes("Upload Video and Live can show clear coaching labels."), true);
  assert.equal(source.includes("Rep drills should include a full phase sequence. Add at least two phases."), true);
  assert.equal(source.includes("Hold drills work best as one sustained phase."), true);

});
