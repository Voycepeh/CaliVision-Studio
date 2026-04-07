import { getCanonicalRenderCanvasSpec } from "@/lib/canvas/spec";
import { CANONICAL_JOINT_NAMES } from "@/lib/pose/canonical";
import type { PortablePose, PortableViewType } from "@/lib/schema/contracts";

/**
 * Canonical portable-pose initializer used by both editor and detection flows.
 * Keeps package-level pose defaults isolated from UI components.
 */
export function createDefaultPortablePose(poseId: string, view: PortableViewType, timestampMs = 0): PortablePose {
  const canvas = getCanonicalRenderCanvasSpec(view);
  const joints: PortablePose["joints"] = {};

  CANONICAL_JOINT_NAMES.forEach((joint) => {
    joints[joint] = {
      x: 0.5,
      y: 0.5,
      confidence: 1
    };
  });

  return {
    poseId,
    timestampMs,
    canvas,
    joints
  };
}
