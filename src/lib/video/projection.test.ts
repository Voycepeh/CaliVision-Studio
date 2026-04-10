import assert from "node:assert/strict";
import test from "node:test";
import { createVideoProjection, projectNormalizedPointToViewport } from "./projection.ts";

test("projects landscape source into landscape viewport with contain fit", () => {
  const projection = createVideoProjection({
    sourceWidth: 1920,
    sourceHeight: 1080,
    viewportWidth: 1280,
    viewportHeight: 720,
    fitMode: "contain"
  });
  assert.deepEqual(projection.renderedRect, { x: 0, y: 0, width: 1280, height: 720 });
});

test("projects portrait source into portrait viewport", () => {
  const projection = createVideoProjection({
    sourceWidth: 1080,
    sourceHeight: 1920,
    viewportWidth: 360,
    viewportHeight: 640,
    fitMode: "contain"
  });
  assert.deepEqual(projection.renderedRect, { x: 0, y: 0, width: 360, height: 640 });
});

test("projects portrait source into landscape viewport with contain fit letterboxing", () => {
  const projection = createVideoProjection({
    sourceWidth: 1080,
    sourceHeight: 1920,
    viewportWidth: 960,
    viewportHeight: 540,
    fitMode: "contain"
  });
  assert.equal(projection.renderedRect.width, 303.75);
  assert.equal(projection.renderedRect.height, 540);
  assert.equal(projection.renderedRect.x, 328.125);
  assert.equal(projection.renderedRect.y, 0);
});

test("projects cover fit with crop offsets", () => {
  const projection = createVideoProjection({
    sourceWidth: 1920,
    sourceHeight: 1080,
    viewportWidth: 360,
    viewportHeight: 640,
    fitMode: "cover"
  });
  assert.equal(projection.renderedRect.width, 1137.7777777777778);
  assert.equal(projection.renderedRect.height, 640);
  assert.equal(projection.renderedRect.x, -388.8888888888889);
  assert.equal(projection.renderedRect.y, 0);
});

test("projects mirrored front-camera point", () => {
  const projection = createVideoProjection({
    sourceWidth: 1280,
    sourceHeight: 720,
    viewportWidth: 640,
    viewportHeight: 360,
    fitMode: "contain",
    mirrorX: true
  });
  const point = projectNormalizedPointToViewport({ x: 0.2, y: 0.4 }, projection);
  assert.equal(point.x, 512);
  assert.equal(point.y, 144);
});
