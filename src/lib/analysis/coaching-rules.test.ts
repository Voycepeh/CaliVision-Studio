import test from "node:test";
import assert from "node:assert/strict";
import { resolveDrillSpecificCoaching } from "./coaching-rules.ts";
import type { PortableDrill } from "../schema/contracts.ts";

const baseHandstand: PortableDrill = {
  drillId: "d1",
  title: "Wall Handstand Hold",
  drillType: "hold",
  difficulty: "beginner",
  tags: [],
  primaryView: "side",
  phases: []
};

const reliableFrame = {
  timestampMs: 0,
  joints: {
    leftWrist: { x: 0.5, y: 0.8, confidence: 0.9 },
    rightWrist: { x: 0.52, y: 0.8, confidence: 0.9 },
    leftHip: { x: 0.3, y: 0.5, confidence: 0.9 },
    rightHip: { x: 0.32, y: 0.5, confidence: 0.9 },
    leftAnkle: { x: 0.25, y: 0.2, confidence: 0.9 },
    rightAnkle: { x: 0.28, y: 0.2, confidence: 0.9 }
  }
};

test("coaching-rules prefers explicit rulesetId over title fallback", () => {
  const output = resolveDrillSpecificCoaching({
    drill: {
      ...baseHandstand,
      title: "Plank Hold",
      coachingProfile: {
        rulesetId: "handstand_wall_hold_v1"
      }
    },
    frame: reliableFrame,
    replayState: { maxHoldMs: 2000 } as never
  });

  assert.equal(output.primaryIssue?.visualGuides.some((guide) => guide.type === "stack_line"), true);
});

test("low-confidence joints fall back to visibility guidance", () => {
  const output = resolveDrillSpecificCoaching({
    drill: baseHandstand,
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

test("non-handstand side-view hold drill does not trigger handstand coaching", () => {
  const output = resolveDrillSpecificCoaching({
    drill: { ...baseHandstand, title: "Wall Plank Hold" },
    frame: reliableFrame
  });
  assert.deepEqual(output, {});
});

test("handstand movementFamily requires hold and side view unless explicit ruleset exists", () => {
  const output = resolveDrillSpecificCoaching({
    drill: {
      ...baseHandstand,
      title: "Handstand Press",
      drillType: "rep",
      coachingProfile: {
        movementFamily: "handstand"
      }
    },
    frame: reliableFrame
  });

  assert.deepEqual(output, {});
});

test("handstand coaching can run with authored profile even when title does not mention handstand", () => {
  const output = resolveDrillSpecificCoaching({
    drill: {
      ...baseHandstand,
      title: "Wall Line Hold",
      coachingProfile: {
        movementFamily: "handstand",
        rulesetId: "handstand_wall_hold_v1",
        enabledVisualGuides: ["stack_line", "highlight_region"]
      }
    },
    frame: reliableFrame
  });

  assert.equal((output.visualGuides ?? []).some((guide) => guide.type === "stack_line"), true);
});

test("legacy enabledVisualGuides no longer filters runtime guide output", () => {
  const output = resolveDrillSpecificCoaching({
    drill: {
      ...baseHandstand,
      coachingProfile: {
        rulesetId: "handstand_wall_hold_v1",
        enabledVisualGuides: ["stack_line"]
      }
    },
    frame: reliableFrame
  });

  assert.equal(output.primaryIssue?.visualGuides.some((guide) => guide.type === "correction_arrow"), true);
  assert.equal(output.primaryIssue?.visualGuides.some((guide) => guide.type === "stack_line"), true);
});
