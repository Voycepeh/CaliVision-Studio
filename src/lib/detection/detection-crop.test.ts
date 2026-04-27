import assert from "node:assert/strict";
import test from "node:test";

import {
  clampDetectionCropToImage,
  computeDetectionCropRectPx,
  createDefaultDetectionCrop,
  mapDetectionResultFromCropToSource,
  normalizeDetectionCrop
} from "./detection-crop.ts";
import type { DetectionResult } from "./types.ts";

test("computeDetectionCropRectPx keeps portrait image crop square and in-bounds", () => {
  const crop = normalizeDetectionCrop({ centerX: 0.48, centerY: 0.63, zoom: 1.75 });
  const rect = computeDetectionCropRectPx(1080, 1920, crop);

  assert.ok(Math.abs(rect.size - 617.1428571428571) < 0.0001);
  assert.equal(rect.sx >= 0 && rect.sx + rect.size <= 1080, true);
  assert.equal(rect.sy >= 0 && rect.sy + rect.size <= 1920, true);
});

test("computeDetectionCropRectPx keeps landscape image crop square and in-bounds", () => {
  const crop = normalizeDetectionCrop({ centerX: 0.76, centerY: 0.24, zoom: 2.2 });
  const rect = computeDetectionCropRectPx(1920, 1080, crop);

  assert.ok(Math.abs(rect.size - 490.9090909090909) < 0.0001);
  assert.equal(rect.sx >= 0 && rect.sx + rect.size <= 1920, true);
  assert.equal(rect.sy >= 0 && rect.sy + rect.size <= 1080, true);
});

test("mapDetectionResultFromCropToSource remaps cropped coordinates into source normalized space", () => {
  const detection: DetectionResult = {
    status: "success",
    joints: {
      leftShoulder: { joint: "leftShoulder", x: 0.1, y: 0.8, confidence: 0.9 },
      rightShoulder: { joint: "rightShoulder", x: 0.9, y: 0.8, confidence: 0.88 }
    },
    confidence: { averageJointConfidence: 0.89, minJointConfidence: 0.88, maxJointConfidence: 0.9, belowThresholdCount: 0 },
    coverage: { detectedJoints: 2, totalCanonicalJoints: 17 },
    issues: [],
    metadata: {
      detector: "mediapipe-pose",
      detectorVersion: "test",
      model: "pose-js",
      imageWidth: 480,
      imageHeight: 480,
      elapsedMs: 4,
      generatedAtIso: "2026-01-01T00:00:00.000Z"
    }
  };

  const mapped = mapDetectionResultFromCropToSource(detection, 1920, 1080, { sx: 720, sy: 120, size: 480 });

  assert.ok(Math.abs((mapped.joints.leftShoulder?.x ?? 0) - 0.4) < 0.000001);
  assert.ok(Math.abs((mapped.joints.leftShoulder?.y ?? 0) - 0.4666666666666667) < 0.000001);
  assert.ok(Math.abs((mapped.joints.rightShoulder?.x ?? 0) - 0.6) < 0.000001);
  assert.ok(Math.abs((mapped.joints.rightShoulder?.y ?? 0) - 0.4666666666666667) < 0.000001);
});

test("createDefaultDetectionCrop returns stable persisted defaults", () => {
  assert.deepEqual(createDefaultDetectionCrop(), {
    centerX: 0.5,
    centerY: 0.5,
    zoom: 1
  });
});

test("clampDetectionCropToImage keeps center in-bounds for high zoom", () => {
  const clamped = clampDetectionCropToImage(1920, 1080, {
    centerX: 0.98,
    centerY: 0.03,
    zoom: 4
  });

  const rect = computeDetectionCropRectPx(1920, 1080, clamped);
  const expectedCenterX = (rect.sx + rect.size / 2) / 1920;
  const expectedCenterY = (rect.sy + rect.size / 2) / 1080;

  assert.ok(Math.abs(clamped.centerX - expectedCenterX) < 0.000001);
  assert.ok(Math.abs(clamped.centerY - expectedCenterY) < 0.000001);
  assert.equal(rect.sx >= 0 && rect.sx + rect.size <= 1920, true);
  assert.equal(rect.sy >= 0 && rect.sy + rect.size <= 1080, true);
});
