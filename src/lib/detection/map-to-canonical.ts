import { getCanonicalRenderCanvasSpec } from "@/lib/canvas/spec";
import { createDefaultPose } from "@/lib/editor/package-editor";
import { CANONICAL_JOINT_NAMES } from "@/lib/pose/canonical";
import type { DetectionResult } from "@/lib/detection/types";
import type { PortablePose, PortableViewType } from "@/lib/schema/contracts";

export function mapDetectionResultToPortablePose(
  detection: DetectionResult,
  options: { poseId: string; timestampMs?: number; view: PortableViewType }
): PortablePose {
  const basePose = createDefaultPose(options.poseId, options.view, options.timestampMs ?? 0);
  const canvas = getCanonicalRenderCanvasSpec(options.view);

  const joints = CANONICAL_JOINT_NAMES.reduce<PortablePose["joints"]>((acc, jointName) => {
    const detectedJoint = detection.joints[jointName];

    if (!detectedJoint) {
      return acc;
    }

    acc[jointName] = {
      x: detectedJoint.x,
      y: detectedJoint.y,
      confidence: detectedJoint.confidence
    };

    return acc;
  }, {});

  return {
    ...basePose,
    canvas,
    joints
  };
}
