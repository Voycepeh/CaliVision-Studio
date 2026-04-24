import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const shellSource = readFileSync(new URL("./AnalysisViewerShell.tsx", import.meta.url), "utf8");

test("rep/hold analysis details start collapsed", () => {
  assert.match(
    shellSource,
    /const \[showDetails, setShowDetails\] = React\.useState\(false\);/,
    "expected structured interval details to be collapsed by default"
  );
});

test("rep/hold analysis includes explicit show and hide detail labels", () => {
  assert.match(shellSource, /Show rep details/, "expected show rep details label");
  assert.match(shellSource, /Hide rep details/, "expected hide rep details label");
  assert.match(shellSource, /Show hold details/, "expected show hold details label");
  assert.match(shellSource, /Hide hold details/, "expected hide hold details label");
});

test("structured summary remains visible while details are collapsed", () => {
  assert.match(shellSource, /detected/, "expected compact total count summary");
  assert.match(shellSource, /Current\/last phase:/, "expected phase summary line");
  assert.match(shellSource, /Analyzed duration:/, "expected analyzed duration summary line");
});

test("structured hold intervals can be inferred from hold events even when movement label is stale", () => {
  assert.match(shellSource, /const hasHoldEvents = model\.timelineEvents\.some\(\(event\) => event\.kind === "hold"\);/);
});

test("hold interval details include phase label and exit reason metadata", () => {
  assert.match(shellSource, /Phase \{interval\.phaseLabel\}/);
  assert.match(shellSource, /Exit \{interval\.exitReason\.replaceAll\("_", " "\)\}/);
});
