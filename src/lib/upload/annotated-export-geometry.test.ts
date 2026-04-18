import assert from "node:assert/strict";
import test from "node:test";
import { createAnnotatedExportGeometry } from "./annotated-export-geometry.ts";

test("createAnnotatedExportGeometry keeps portrait source and projection in same coordinate space", () => {
  const geometry = createAnnotatedExportGeometry({
    sourceWidth: 720,
    sourceHeight: 1280,
    timelineWidth: 720,
    timelineHeight: 1280
  });

  assert.equal(geometry.canvasWidth, 720);
  assert.equal(geometry.canvasHeight, 1280);
  assert.equal(geometry.projection.renderedWidth, 720);
  assert.equal(geometry.projection.renderedHeight, 1280);
  assert.equal(geometry.projection.offsetX, 0);
  assert.equal(geometry.projection.offsetY, 0);
  assert.equal(geometry.timelineMatchesSource, true);
});

test("createAnnotatedExportGeometry flags source/timeline mismatch diagnostics", () => {
  const geometry = createAnnotatedExportGeometry({
    sourceWidth: 720,
    sourceHeight: 1280,
    timelineWidth: 1080,
    timelineHeight: 1920
  });

  assert.equal(geometry.canvasWidth, 720);
  assert.equal(geometry.canvasHeight, 1280);
  assert.equal(geometry.timelineWidth, 1080);
  assert.equal(geometry.timelineHeight, 1920);
  assert.equal(geometry.timelineMatchesSource, false);
});
