import { getCanonicalRenderCanvasSpec } from "@/lib/canvas/spec";
import type { CanonicalJointName, PortablePhase, PortablePose } from "@/lib/schema/contracts";

const DEFAULT_PHASE_DURATION_MS = 1200;
const MIN_PHASE_DURATION_MS = 100;

export type AnimationWarningSeverity = "info" | "warning";

export type AnimationWarning = {
  severity: AnimationWarningSeverity;
  message: string;
};

export type AnimationPhaseSegment = {
  phaseId: string;
  title: string;
  durationMs: number;
  startMs: number;
  endMs: number;
  fromPose: PortablePose | null;
  toPose: PortablePose | null;
};

export type AnimationTimeline = {
  segments: AnimationPhaseSegment[];
  totalDurationMs: number;
  warnings: AnimationWarning[];
};

export type AnimationFrameSample = {
  phaseIndex: number;
  phaseId: string | null;
  phaseTitle: string;
  localProgress: number;
  elapsedMs: number;
  pose: PortablePose | null;
};

export function buildAnimationTimeline(phases: PortablePhase[]): AnimationTimeline {
  if (phases.length === 0) {
    return {
      segments: [],
      totalDurationMs: 0,
      warnings: [{ severity: "info", message: "Load a drill with phases to preview animation." }]
    };
  }

  const warnings: AnimationWarning[] = [];
  if (phases.length < 2) {
    warnings.push({ severity: "info", message: "Only one phase is available. Preview will hold a static pose for the phase duration." });
  }

  const duplicateOrderEntries = findDuplicateOrderEntries(phases);
  if (duplicateOrderEntries.length > 0) {
    warnings.push({ severity: "warning", message: `Duplicate phase order values detected: ${duplicateOrderEntries.join(", ")}. Sorted order is used for preview.` });
  }

  const segments: AnimationPhaseSegment[] = [];
  let cursorMs = 0;

  phases.forEach((phase, index) => {
    const durationMs = sanitizeDurationMs(phase.durationMs);
    if (!Number.isFinite(phase.durationMs) || phase.durationMs <= 0) {
      warnings.push({
        severity: "warning",
        message: `Phase ${phase.order} (${phase.title}) has invalid duration '${String(phase.durationMs)}'. Using fallback ${durationMs}ms.`
      });
    }

    const fromPose = phase.poseSequence[0] ?? null;
    const toPhase = phases[(index + 1) % phases.length] ?? null;
    const toPose = phases.length > 1 ? toPhase?.poseSequence[0] ?? null : fromPose;

    if (!fromPose) {
      warnings.push({ severity: "warning", message: `Phase ${phase.order} (${phase.title}) has no canonical pose. Preview will interpolate with available neighboring pose data.` });
    }

    const missingCoverage = getMissingJointCoverageNotice(fromPose, toPose, phase.title, toPhase?.title ?? phase.title);
    if (missingCoverage) {
      warnings.push({ severity: "info", message: missingCoverage });
    }

    segments.push({
      phaseId: phase.phaseId,
      title: phase.title,
      durationMs,
      startMs: cursorMs,
      endMs: cursorMs + durationMs,
      fromPose,
      toPose
    });

    cursorMs += durationMs;
  });

  return {
    segments,
    totalDurationMs: cursorMs,
    warnings: dedupeWarnings(warnings)
  };
}

export function sampleAnimationTimeline(timeline: AnimationTimeline, elapsedMs: number): AnimationFrameSample {
  if (timeline.segments.length === 0 || timeline.totalDurationMs <= 0) {
    return {
      phaseIndex: -1,
      phaseId: null,
      phaseTitle: "No phase",
      localProgress: 0,
      elapsedMs: 0,
      pose: null
    };
  }

  const clampedElapsed = clamp(elapsedMs, 0, timeline.totalDurationMs);
  const segment = timeline.segments.find((item) => clampedElapsed <= item.endMs) ?? timeline.segments[timeline.segments.length - 1];
  const localElapsed = clamp(clampedElapsed - segment.startMs, 0, segment.durationMs);
  const localProgress = segment.durationMs <= 0 ? 1 : clamp(localElapsed / segment.durationMs, 0, 1);

  return {
    phaseIndex: timeline.segments.findIndex((item) => item.phaseId === segment.phaseId),
    phaseId: segment.phaseId,
    phaseTitle: segment.title,
    localProgress,
    elapsedMs: clampedElapsed,
    pose: interpolatePoses(segment.fromPose, segment.toPose, localProgress, `${segment.phaseId}_preview`)
  };
}

export function sanitizeDurationMs(durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return DEFAULT_PHASE_DURATION_MS;
  }

  return Math.max(MIN_PHASE_DURATION_MS, Math.round(durationMs));
}

function interpolatePoses(fromPose: PortablePose | null, toPose: PortablePose | null, t: number, poseId: string): PortablePose | null {
  const normalizedProgress = clamp(t, 0, 1);
  const baseCanvas = fromPose?.canvas ?? toPose?.canvas ?? getCanonicalRenderCanvasSpec();

  if (!fromPose && !toPose) {
    return null;
  }

  const joints: PortablePose["joints"] = {};
  const jointNames = new Set<CanonicalJointName>();

  if (fromPose) {
    Object.keys(fromPose.joints).forEach((joint) => {
      jointNames.add(joint as CanonicalJointName);
    });
  }

  if (toPose) {
    Object.keys(toPose.joints).forEach((joint) => {
      jointNames.add(joint as CanonicalJointName);
    });
  }

  jointNames.forEach((jointName) => {
    const fromJoint = fromPose?.joints[jointName];
    const toJoint = toPose?.joints[jointName];

    if (!fromJoint && !toJoint) {
      return;
    }

    if (fromJoint && toJoint) {
      joints[jointName] = {
        x: lerp(fromJoint.x, toJoint.x, normalizedProgress),
        y: lerp(fromJoint.y, toJoint.y, normalizedProgress),
        confidence: Math.min(fromJoint.confidence ?? 1, toJoint.confidence ?? 1)
      };
      return;
    }

    const fallback = fromJoint ?? toJoint;
    if (!fallback) {
      return;
    }

    joints[jointName] = {
      x: fallback.x,
      y: fallback.y,
      confidence: fallback.confidence
    };
  });

  return {
    poseId,
    timestampMs: 0,
    canvas: baseCanvas,
    joints
  };
}

function getMissingJointCoverageNotice(fromPose: PortablePose | null, toPose: PortablePose | null, fromTitle: string, toTitle: string): string | null {
  if (!fromPose || !toPose) {
    return null;
  }

  const fromCount = Object.keys(fromPose.joints).length;
  const toCount = Object.keys(toPose.joints).length;
  if (fromCount === 0 || toCount === 0) {
    return `Interpolation between \"${fromTitle}\" and \"${toTitle}\" uses fallback joints because one pose has no visible joints.`;
  }

  return null;
}

function findDuplicateOrderEntries(phases: PortablePhase[]): number[] {
  const counts = new Map<number, number>();
  phases.forEach((phase) => {
    counts.set(phase.order, (counts.get(phase.order) ?? 0) + 1);
  });

  return [...counts.entries()].flatMap(([order, count]) => (count > 1 ? [order] : []));
}

function dedupeWarnings(warnings: AnimationWarning[]): AnimationWarning[] {
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    const key = `${warning.severity}:${warning.message}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}
