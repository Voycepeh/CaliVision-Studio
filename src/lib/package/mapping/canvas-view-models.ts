import {
  normalizedToCanvasPoint,
  validateJointPoint,
  type Point2D
} from "@/lib/canvas/mapping";
import { getCanonicalRenderCanvasSpec } from "@/lib/canvas/spec";
import {
  CANONICAL_JOINT_NAMES,
  CANONICAL_SKELETON_CONNECTIONS
} from "@/lib/pose/canonical";
import { getPreviewConnections, getPreviewJointNames } from "@/lib/pose/preview-overlay";
import type {
  CanonicalJointName,
  PortableCanvasSpec,
  PortablePhase,
  PortablePose
} from "@/lib/schema/contracts";

export type CanvasJointModel = {
  name: CanonicalJointName;
  normalized: Point2D;
  pixel: Point2D;
  confidence?: number;
  outOfBounds: boolean;
};

export type CanvasPoseStatus = "ready" | "empty" | "invalid";

export type CanvasPoseModel = {
  status: CanvasPoseStatus;
  canvas: PortableCanvasSpec;
  joints: CanvasJointModel[];
  connections: { from: CanvasJointModel; to: CanvasJointModel }[];
  warnings: string[];
};

export type InspectorPhaseViewModel = {
  phaseId: string;
  order: number;
  title: string;
  durationMs: number;
  viewSummary: string;
  poseCount: number;
  assetCount: number;
  summary?: string;
  firstPoseId?: string;
};

const EMPTY_CANVAS_POSE_MODEL: CanvasPoseModel = {
  status: "empty",
  canvas: getCanonicalRenderCanvasSpec(),
  joints: [],
  connections: [],
  warnings: []
};

export function mapPortablePoseToCanvasPoseModel(pose?: PortablePose | null): CanvasPoseModel {
  if (!pose) {
    return EMPTY_CANVAS_POSE_MODEL;
  }

  const canvas = getCanonicalRenderCanvasSpec(pose.canvas.view);
  const warnings: string[] = [];
  const previewJointNames = new Set(getPreviewJointNames(pose.canvas.view));
  const previewConnections = getPreviewConnections(pose.canvas.view);

  if (pose.canvas.view === "side") {
    warnings.push("Side-view preview currently renders the left profile chain by default.");
  }

  if (pose.canvas.widthRef !== canvas.widthRef || pose.canvas.heightRef !== canvas.heightRef) {
    warnings.push(
      `Pose canvas refs (${pose.canvas.widthRef}x${pose.canvas.heightRef}) differ from Studio canonical render surface (${canvas.widthRef}x${canvas.heightRef}).`
    );
  }

  const joints = CANONICAL_JOINT_NAMES.flatMap((jointName) => {
    if (!previewJointNames.has(jointName)) {
      return [];
    }

    const point = pose.joints[jointName];

    if (!point) {
      return [];
    }

    const pointWarnings = validateJointPoint(point);
    warnings.push(...pointWarnings.map((warning) => `${jointName}: ${warning}`));

    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return [];
    }

    const outOfBounds = point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1;

    return [
      {
        name: jointName,
        normalized: { x: point.x, y: point.y },
        pixel: normalizedToCanvasPoint(point, canvas, { clamp: true }),
        confidence: point.confidence,
        outOfBounds
      }
    ];
  });

  const byName = new Map(joints.map((joint) => [joint.name, joint]));
  const canonicalConnectionKeys = new Set(CANONICAL_SKELETON_CONNECTIONS.map((connection) => `${connection.from}:${connection.to}`));
  const connections = previewConnections.flatMap((connection) => {
    if (!canonicalConnectionKeys.has(`${connection.from}:${connection.to}`)) {
      return [];
    }

    const from = byName.get(connection.from);
    const to = byName.get(connection.to);

    if (!from || !to) {
      return [];
    }

    return [{ from, to }];
  });

  if (joints.length === 0) {
    return {
      status: "invalid",
      canvas,
      joints,
      connections,
      warnings: [...warnings, "No canonical joints available to render for this pose."]
    };
  }

  if (joints.length < previewJointNames.size / 2) {
    warnings.push(
      `Only ${joints.length} of ${previewJointNames.size} preview joints are populated in this pose.`
    );
  }

  return {
    status: "ready",
    canvas,
    joints,
    connections,
    warnings
  };
}

export function mapPortablePhaseToInspectorViewModel(phase: PortablePhase): InspectorPhaseViewModel {
  const firstPose = phase.poseSequence[0];
  const uniqueViews = new Set(phase.poseSequence.map((pose) => pose.canvas.view));

  return {
    phaseId: phase.phaseId,
    order: phase.order,
    title: phase.title,
    durationMs: phase.durationMs,
    viewSummary: uniqueViews.size === 0 ? "No pose view metadata" : [...uniqueViews].join(", "),
    poseCount: phase.poseSequence.length,
    assetCount: phase.assetRefs.length,
    summary: phase.summary,
    firstPoseId: firstPose?.poseId
  };
}
