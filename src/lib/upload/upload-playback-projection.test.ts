import assert from "node:assert/strict";
import test from "node:test";
import { createUploadPlaybackProjection } from "./upload-playback-projection.ts";

test("createUploadPlaybackProjection handles portrait intrinsic in portrait viewport", () => {
  const projection = createUploadPlaybackProjection({
    intrinsicWidth: 1080,
    intrinsicHeight: 1920,
    viewportWidth: 360,
    viewportHeight: 640,
    fitMode: "contain"
  });

  assert.equal(projection.renderedWidth, 360);
  assert.equal(projection.renderedHeight, 640);
  assert.equal(projection.offsetX, 0);
  assert.equal(projection.offsetY, 0);
  assert.equal(projection.scale, 1 / 3);
});

test("createUploadPlaybackProjection handles portrait intrinsic in landscape viewport with letterboxing", () => {
  const projection = createUploadPlaybackProjection({
    intrinsicWidth: 1080,
    intrinsicHeight: 1920,
    viewportWidth: 960,
    viewportHeight: 540,
    fitMode: "contain"
  });

  assert.equal(projection.renderedWidth, 303.75);
  assert.equal(projection.renderedHeight, 540);
  assert.equal(projection.offsetX, 328.125);
  assert.equal(projection.offsetY, 0);
  assert.equal(projection.scale, 0.28125);
});

test("createUploadPlaybackProjection handles landscape intrinsic in portrait viewport", () => {
  const projection = createUploadPlaybackProjection({
    intrinsicWidth: 1920,
    intrinsicHeight: 1080,
    viewportWidth: 360,
    viewportHeight: 640,
    fitMode: "contain"
  });

  assert.equal(projection.renderedWidth, 360);
  assert.equal(projection.renderedHeight, 202.5);
  assert.equal(projection.offsetX, 0);
  assert.equal(projection.offsetY, 218.75);
  assert.equal(projection.scale, 0.1875);
});
