import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "src/components/live/LiveStreamingWorkspace.tsx"), "utf8");

test("live hold summary cards include best/total/count metrics", () => {
  assert.equal(source.includes('label: "Best hold"'), true);
  assert.equal(source.includes('label: "Total hold time"'), true);
  assert.equal(source.includes('label: "Completed holds"'), true);
});

test("live hold summary hides rep count chip for hold drills", () => {
  assert.match(
    source,
    /\.\.\.\(selection\.drill\?\.drillType === "hold"\s*\?\s*\[\]\s*:\s*\[\{ id: "reps", label: "Completed reps so far"/
  );
});
