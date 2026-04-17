import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const liveWorkspaceSource = readFileSync(new URL("./LiveStreamingWorkspace.tsx", import.meta.url), "utf8");

test("live overlay path wires center-of-gravity tracker into star draw path", () => {
  assert.ok(liveWorkspaceSource.includes("centerOfGravityTrackerRef = useRef(createCenterOfGravityTracker())"));
  assert.ok(liveWorkspaceSource.includes("centerOfGravityTracker: centerOfGravityTrackerRef.current"));
  assert.ok(liveWorkspaceSource.includes("centerOfGravityTrackerRef.current.reset()"));
});
