import test from "node:test";
import assert from "node:assert/strict";
import { getPreviewConnections, getPreviewJointNames } from "./preview-overlay.ts";
import type { PortableViewType } from "@/lib/schema/contracts";

const VIEWS: PortableViewType[] = ["front", "side", "rear"];

test("preview joint selector stays simplified for side view", () => {
  const joints = getPreviewJointNames("side");
  assert.ok(joints.includes("leftShoulder"));
  assert.ok(joints.includes("leftHip"));
  assert.ok(!joints.includes("rightWrist"));
  assert.ok(!joints.includes("rightAnkle"));
});

test("preview connections only reference preview-visible joints", () => {
  for (const view of VIEWS) {
    const joints = new Set(getPreviewJointNames(view));
    const connections = getPreviewConnections(view);
    for (const segment of connections) {
      assert.ok(joints.has(segment.from), `${view}: missing from joint ${segment.from}`);
      assert.ok(joints.has(segment.to), `${view}: missing to joint ${segment.to}`);
    }
  }
});
