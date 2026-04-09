import test from "node:test";
import assert from "node:assert/strict";
import { fitVideoContainRect } from "./video-layout.ts";

test("fitVideoContainRect centers portrait video in a landscape container", () => {
  const rect = fitVideoContainRect({ containerWidth: 960, containerHeight: 540, videoWidth: 1080, videoHeight: 1920 });

  assert.equal(rect.renderedHeight, 540);
  assert.equal(rect.renderedWidth, 303.75);
  assert.equal(rect.offsetX, 328.125);
  assert.equal(rect.offsetY, 0);
});

test("fitVideoContainRect centers landscape video in a square container", () => {
  const rect = fitVideoContainRect({ containerWidth: 700, containerHeight: 700, videoWidth: 1920, videoHeight: 1080 });

  assert.equal(rect.renderedWidth, 700);
  assert.equal(rect.renderedHeight, 393.75);
  assert.equal(rect.offsetX, 0);
  assert.equal(rect.offsetY, 153.125);
});

test("fitVideoContainRect falls back safely for missing dimensions", () => {
  const rect = fitVideoContainRect({ containerWidth: 500, containerHeight: 300, videoWidth: 0, videoHeight: 0 });

  assert.deepEqual(rect, {
    renderedWidth: 500,
    renderedHeight: 300,
    offsetX: 0,
    offsetY: 0
  });
});
