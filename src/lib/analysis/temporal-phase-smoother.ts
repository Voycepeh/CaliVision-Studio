import type { PortableDrillAnalysis } from "../schema/contracts.ts";
import type { PhaseRuntimeModel } from "./phase-runtime.ts";
import type { FramePhaseScore, SmoothedPhaseFrame, TemporalSmoothingResult } from "./types.ts";

export function smoothPhaseTimeline(
  scoredFrames: FramePhaseScore[],
  analysis: PortableDrillAnalysis,
  options: { entryConfirmationFrames?: number; runtimeModel?: PhaseRuntimeModel } = {}
): TemporalSmoothingResult {
  const minimumConfirmationFrames = Math.max(1, options.entryConfirmationFrames ?? analysis.minimumConfirmationFrames ?? 1);
  const exitGraceFrames = Math.max(0, analysis.exitGraceFrames || 0);
  const runtimeModel = options.runtimeModel;
  const runtimePhaseIds = runtimeModel ? new Set(runtimeModel.orderedPhaseIds) : null;
  const allowedSkipKeys = new Set((analysis.allowedPhaseSkips ?? [])
    .filter((skip) => !runtimePhaseIds || (runtimePhaseIds.has(skip.fromPhaseId) && runtimePhaseIds.has(skip.toPhaseId)))
    .map((skip) => `${skip.fromPhaseId}->${skip.toPhaseId}`));
  const orderedTransitionKeys = runtimeModel?.allowedTransitionKeys
    ? new Set(runtimeModel.allowedTransitionKeys)
    : buildOrderedTransitionKeys(analysis.orderedPhaseSequence, analysis.measurementType);

  let stablePhaseId: string | null = null;
  let candidatePhaseId: string | null = null;
  let candidateFrames = 0;
  let exitFrames = 0;

  const frames: SmoothedPhaseFrame[] = [];
  const transitions: TemporalSmoothingResult["transitions"] = [];

  for (const frame of scoredFrames) {
    const rawPhaseIdUnfiltered = frame.bestPhaseId;
    const rawPhaseId = runtimePhaseIds && rawPhaseIdUnfiltered && !runtimePhaseIds.has(rawPhaseIdUnfiltered)
      ? null
      : rawPhaseIdUnfiltered;
    let transitionAccepted = false;

    if (rawPhaseIdUnfiltered && rawPhaseIdUnfiltered !== rawPhaseId) {
      transitions.push({
        timestampMs: frame.timestampMs,
        type: "invalid_transition",
        fromPhaseId: stablePhaseId ?? undefined,
        toPhaseId: rawPhaseIdUnfiltered,
        details: { reason: "unknown_runtime_phase" }
      });
    }

    if (rawPhaseId === stablePhaseId) {
      candidatePhaseId = null;
      candidateFrames = 0;
      exitFrames = 0;
    } else if (rawPhaseId === null) {
      exitFrames += 1;
      if (stablePhaseId && exitFrames > exitGraceFrames) {
        const rejectReason = frame.bestPhaseScore < 0.2 ? "low_confidence" : "match_rejected";
        transitions.push({
          timestampMs: frame.timestampMs,
          type: "phase_exit",
          phaseId: stablePhaseId,
          fromPhaseId: stablePhaseId,
          details: { reason: rejectReason }
        });
        stablePhaseId = null;
        transitionAccepted = true;
      }
    } else {
      exitFrames = 0;
      if (candidatePhaseId !== rawPhaseId) {
        candidatePhaseId = rawPhaseId;
        candidateFrames = 1;
      } else {
        candidateFrames += 1;
      }

      if (candidateFrames >= minimumConfirmationFrames) {
        const allowed = isAllowedTransition(stablePhaseId, rawPhaseId, orderedTransitionKeys, allowedSkipKeys);
        if (allowed.ok) {
          if (stablePhaseId) {
            transitions.push({
              timestampMs: frame.timestampMs,
              type: "phase_exit",
              phaseId: stablePhaseId,
              fromPhaseId: stablePhaseId,
              toPhaseId: rawPhaseId
            });
          }
          transitions.push({
            timestampMs: frame.timestampMs,
            type: "phase_enter",
            phaseId: rawPhaseId,
            fromPhaseId: stablePhaseId ?? undefined,
            toPhaseId: rawPhaseId,
            details: allowed.usedSkip
              ? { usedAllowedSkip: true }
              : undefined
          });
          stablePhaseId = rawPhaseId;
          candidatePhaseId = null;
          candidateFrames = 0;
          transitionAccepted = true;
        } else {
          transitions.push({
            timestampMs: frame.timestampMs,
            type: "invalid_transition",
            fromPhaseId: stablePhaseId ?? undefined,
            toPhaseId: rawPhaseId,
            details: allowed.reason ? { reason: allowed.reason } : undefined
          });
          candidatePhaseId = null;
          candidateFrames = 0;
        }
      }
    }

    frames.push({
      timestampMs: frame.timestampMs,
      rawBestPhaseId: rawPhaseId,
      rawBestPhaseScore: frame.bestPhaseScore,
      smoothedPhaseId: stablePhaseId,
      transitionAccepted
    });
  }

  return { frames, transitions };
}

function isAllowedTransition(
  fromPhaseId: string | null,
  toPhaseId: string,
  orderedTransitionKeys: Set<string>,
  allowedSkipKeys: Set<string>
): { ok: boolean; reason?: string; usedSkip?: boolean } {
  if (!fromPhaseId || fromPhaseId === toPhaseId) {
    return { ok: true };
  }

  if (allowedSkipKeys.has(`${fromPhaseId}->${toPhaseId}`)) {
    return { ok: true, usedSkip: true };
  }

  if (orderedTransitionKeys.size === 0 || orderedTransitionKeys.has(`${fromPhaseId}->${toPhaseId}`)) {
    return { ok: true };
  }

  return { ok: false, reason: "transition_not_ordered_or_allowed_skip" };
}

function buildOrderedTransitionKeys(
  orderedPhaseSequence: string[],
  measurementType: PortableDrillAnalysis["measurementType"]
): Set<string> {
  const keys = new Set<string>();
  for (let index = 0; index < orderedPhaseSequence.length - 1; index += 1) {
    keys.add(`${orderedPhaseSequence[index]}->${orderedPhaseSequence[index + 1]}`);
  }
  if ((measurementType === "rep" || measurementType === "hybrid") && orderedPhaseSequence.length > 1) {
    keys.add(`${orderedPhaseSequence[orderedPhaseSequence.length - 1]}->${orderedPhaseSequence[0]}`);
  }
  return keys;
}
