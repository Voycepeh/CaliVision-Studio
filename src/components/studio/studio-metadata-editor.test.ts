import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "src/components/studio/StudioMetadataEditor.tsx"), "utf8");

test("Studio metadata editor tucks coaching controls behind advanced details", () => {
  assert.equal(source.includes("Advanced coaching settings"), true);
  assert.equal(source.includes("<details>"), true);
  assert.equal(source.includes("Auto-selected from drill details"), true);
});

test("Studio metadata editor includes simplified coaching copy", () => {
  assert.equal(
    source.includes("Coaching setup helps CaliVision choose the right analysis language and feedback priority for this drill."),
    true
  );
  assert.equal(source.includes("Coaching Profile tells CaliVision which coaching rules and visual guides to use for this drill."), false);
  assert.equal(source.includes("Visual guides"), false);
  assert.equal(source.includes("Stack line"), false);
  assert.equal(source.includes("Ghost pose"), false);
  assert.equal(source.includes("Highlight region"), false);
  assert.equal(source.includes("Correction arrow"), false);
  assert.equal(source.includes("Support indicator"), false);
  assert.equal(source.includes("Metric badge"), false);
});
