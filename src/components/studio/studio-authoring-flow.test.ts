import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const filePath = join(process.cwd(), "src/components/studio/StudioCenterInspector.tsx");
const source = readFileSync(filePath, "utf8");

test("drill setup no longer mounts benchmark/reference editor in normal authoring flow", () => {
  assert.equal(source.includes("<StudioBenchmarkEditor />"), false);
  assert.equal(source.includes("StudioBenchmarkEditor"), false);
  assert.equal(source.includes("Reference criteria"), false);
  assert.equal(source.includes("Comparison settings enabled"), false);
});

test("phase sequence section explains drill-first reference and optional hold rules", () => {
  assert.equal(source.includes("Drill phases are the reference standard"), true);
  assert.equal(source.includes("Phase rules"), true);
  assert.equal(source.includes("Hold requirement"), true);
});

test("studio experience can show explicit new-drill creation state", () => {
  const experienceSource = readFileSync(join(process.cwd(), "src/components/studio/StudioExperience.tsx"), "utf8");
  assert.equal(experienceSource.includes("initialIntent === \"create\""), true);
  assert.equal(experienceSource.includes("New drill draft"), true);
});
