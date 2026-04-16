import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const upload = readFileSync("src/components/upload/UploadVideoWorkspace.tsx", "utf8");
const live = readFileSync("src/components/live/LiveStreamingWorkspace.tsx", "utf8");

test("Upload setup order is Drill Origin, Drill, then Cadence FPS", () => {
  const originIndex = upload.indexOf("<DrillOriginSelectField");
  const drillIndex = upload.indexOf("<DrillComboboxField");
  const cadenceIndex = upload.indexOf("<span>Cadence FPS</span>");

  assert.ok(originIndex >= 0);
  assert.ok(drillIndex > originIndex);
  assert.ok(cadenceIndex > drillIndex);
});

test("Live setup places Camera and Drill Origin before Drill", () => {
  const cameraIndex = live.indexOf("<span>Camera</span>");
  const originIndex = live.indexOf("<DrillOriginSelectField");
  const drillIndex = live.indexOf("<DrillComboboxField");

  assert.ok(cameraIndex >= 0);
  assert.ok(originIndex > cameraIndex);
  assert.ok(drillIndex > originIndex);
});
