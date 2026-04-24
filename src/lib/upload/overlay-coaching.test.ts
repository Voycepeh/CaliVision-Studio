import test from "node:test";
import assert from "node:assert/strict";
import { resolveCoachingArrowEndpoint } from "./coaching-overlay-geometry.ts";

test("toward_line arrow targets stack line instead of defaulting right", () => {
  const endpoint = resolveCoachingArrowEndpoint({
    from: { x: 420, y: 200 },
    guide: {
      type: "correction_arrow",
      direction: "toward_line",
      targetJoints: ["leftWrist", "rightWrist"]
    },
    frame: {
      timestampMs: 0,
      joints: {
        leftWrist: { x: 0.2, y: 0.8 },
        rightWrist: { x: 0.24, y: 0.8 }
      }
    },
    width: 1000
  });

  assert.equal(endpoint.x, 220);
  assert.equal(endpoint.y, 200);
});
