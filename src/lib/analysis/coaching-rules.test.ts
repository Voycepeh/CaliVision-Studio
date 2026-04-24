import test from "node:test";
import assert from "node:assert/strict";
import { resolveDrillSpecificCoaching } from "./coaching-rules.ts";
import type { PortableDrill } from "../schema/contracts.ts";

const handstand: PortableDrill = {
  drillId: "d1",
  title: "Wall Handstand Hold",
  drillType: "hold",
  difficulty: "beginner",
  tags: [],
  primaryView: "side",
  phases: []
};

test("handstand side-view rule returns stack-line visual guide with reliable joints", () => {
  const output = resolveDrillSpecificCoaching({
    drill: handstand,
    replayState: { maxHoldMs: 2000 } as never,
    frame: {
      timestampMs: 0,
      joints: {
        leftWrist: { x: 0.5, y: 0.8, confidence: 0.9 },
        rightWrist: { x: 0.52, y: 0.8, confidence: 0.9 },
        leftHip: { x: 0.3, y: 0.5, confidence: 0.9 },
        rightHip: { x: 0.32, y: 0.5, confidence: 0.9 },
        leftAnkle: { x: 0.25, y: 0.2, confidence: 0.9 },
        rightAnkle: { x: 0.28, y: 0.2, confidence: 0.9 }
      }
    }
  });
  assert.equal(output.primaryIssue?.visualGuides.some((guide) => guide.type === "stack_line"), true);
  assert.equal((output.primaryIssue ? 1 : 0) <= 1, true);
});

test("low-confidence joints fall back to visibility guidance", () => {
  const output = resolveDrillSpecificCoaching({
    drill: handstand,
    frame: {
      timestampMs: 0,
      joints: {
        leftWrist: { x: 0.5, y: 0.8, confidence: 0.2 }
      }
    }
  });
  assert.match(output.primaryIssue?.description ?? "", /full body in frame/i);
  assert.equal(output.primaryIssue?.severity, "info");
});
