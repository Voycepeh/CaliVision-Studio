import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryAnalysisSessionRepository } from "./session-repository.ts";
import { buildCompletedUploadAnalysisSession, persistCompletedUploadAnalysisSession, persistFailedUploadAnalysisSession } from "./session-service.ts";
import type { PoseTimeline } from "../upload/types.ts";
import type { PortableDrill, PortablePhase, PortablePose } from "../schema/contracts.ts";

function makePose(poseId: string, timestampMs: number, wristY: number): PortablePose {
  return {
    poseId,
    timestampMs,
    canvas: { coordinateSystem: "normalized-2d", widthRef: 1, heightRef: 1, view: "side" },
    joints: {
      leftShoulder: { x: 0.35, y: 0.35 },
      rightShoulder: { x: 0.65, y: 0.35 },
      leftHip: { x: 0.4, y: 0.65 },
      rightHip: { x: 0.7, y: 0.65 },
      leftWrist: { x: 0.36, y: wristY },
      rightWrist: { x: 0.64, y: wristY }
    }
  };
}

function buildDrill(): PortableDrill {
  const phases: PortablePhase[] = [
    { phaseId: "top", order: 1, name: "Top", durationMs: 500, poseSequence: [makePose("top", 0, 0.2)], assetRefs: [] },
    { phaseId: "bottom", order: 2, name: "Bottom", durationMs: 500, poseSequence: [makePose("bottom", 500, 0.8)], assetRefs: [] }
  ];

  return {
    drillId: "service-drill",
    slug: "service-drill",
    title: "Service Drill",
    drillType: "rep",
    difficulty: "beginner",
    tags: [],
    primaryView: "side",
    phases,
    analysis: {
      measurementType: "rep",
      orderedPhaseSequence: ["top", "bottom", "top"],
      criticalPhaseIds: ["top", "bottom"],
      allowedPhaseSkips: [],
      minimumConfirmationFrames: 1,
      exitGraceFrames: 1,
      minimumRepDurationMs: 100,
      cooldownMs: 0,
      entryConfirmationFrames: 1,
      minimumHoldDurationMs: 300
    }
  };
}

function createTimeline(): PoseTimeline {
  return {
    schemaVersion: "upload-video-v1",
    detector: "mediapipe-pose-landmarker",
    cadenceFps: 12,
    video: {
      fileName: "attempt.mp4",
      width: 1280,
      height: 720,
      durationMs: 1500,
      sizeBytes: 999_999,
      mimeType: "video/mp4"
    },
    generatedAtIso: "2026-04-07T12:00:00.000Z",
    frames: [
      {
        timestampMs: 0,
        joints: {
          leftShoulder: { x: 0.35, y: 0.35, confidence: 0.99 },
          rightShoulder: { x: 0.65, y: 0.35, confidence: 0.99 },
          leftHip: { x: 0.4, y: 0.65, confidence: 0.99 },
          rightHip: { x: 0.7, y: 0.65, confidence: 0.99 },
          leftWrist: { x: 0.36, y: 0.2, confidence: 0.99 },
          rightWrist: { x: 0.64, y: 0.2, confidence: 0.99 }
        }
      },
      {
        timestampMs: 500,
        joints: {
          leftShoulder: { x: 0.35, y: 0.35, confidence: 0.99 },
          rightShoulder: { x: 0.65, y: 0.35, confidence: 0.99 },
          leftHip: { x: 0.4, y: 0.65, confidence: 0.99 },
          rightHip: { x: 0.7, y: 0.65, confidence: 0.99 },
          leftWrist: { x: 0.36, y: 0.8, confidence: 0.99 },
          rightWrist: { x: 0.64, y: 0.8, confidence: 0.99 }
        }
      },
      {
        timestampMs: 1000,
        joints: {
          leftShoulder: { x: 0.35, y: 0.35, confidence: 0.99 },
          rightShoulder: { x: 0.65, y: 0.35, confidence: 0.99 },
          leftHip: { x: 0.4, y: 0.65, confidence: 0.99 },
          rightHip: { x: 0.7, y: 0.65, confidence: 0.99 },
          leftWrist: { x: 0.36, y: 0.2, confidence: 0.99 },
          rightWrist: { x: 0.64, y: 0.2, confidence: 0.99 }
        }
      }
    ]
  };
}

test("upload analysis path persists exactly one completed session", async () => {
  const repository = new InMemoryAnalysisSessionRepository();
  const drill = buildDrill();

  await persistCompletedUploadAnalysisSession({
    repository,
    drill,
    drillVersion: "sample-v1",
    timeline: createTimeline(),
    sourceId: "upload-job-1",
    sourceLabel: "attempt.mp4",
    sourceUri: "upload://local/upload-job-1/attempt.mp4",
    annotatedVideoUri: "upload://local/upload-job-1/attempt.annotated-video.webm"
  });

  const sessions = await repository.listRecentSessions();
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.status, "completed");
  assert.equal(sessions[0]?.sourceKind, "upload");
  assert.equal(sessions[0]?.sourceUri, "upload://local/upload-job-1/attempt.mp4");
  assert.equal(sessions[0]?.pipelineVersion, "drill-analysis-pipeline-v1");
  assert.equal(sessions[0]?.scorerVersion, "frame-phase-scorer-v1");
  assert.equal(sessions[0]?.annotatedVideoUri, "upload://local/upload-job-1/attempt.annotated-video.webm");
  assert.equal(sessions[0]?.drillBinding?.drillId, "service-drill");
  assert.equal(Array.isArray(sessions[0]?.debug?.smootherTransitions), true);
  assert.equal(Array.isArray(sessions[0]?.debug?.smoothedFrames), true);
});

test("buildCompletedUploadAnalysisSession constructs a session record without saving", async () => {
  const repository = new InMemoryAnalysisSessionRepository();
  const drill = buildDrill();
  const built = buildCompletedUploadAnalysisSession({
    drill,
    drillVersion: "sample-v1",
    timeline: createTimeline(),
    sourceId: "upload-job-build-only",
    sourceLabel: "attempt.mp4"
  });

  assert.equal(built.sourceId, "upload-job-build-only");
  assert.equal(built.status, "completed");
  assert.deepEqual(built.debug?.runtimeDiagnostics?.expectedPhaseOrder, ["1. Top", "2. Bottom", "1. Top"]);
  assert.equal(typeof built.debug?.runtimeDiagnostics?.modeSummary, "string");
  assert.equal(built.debug?.runtimeDiagnostics?.allowedTransitions.includes("2. Bottom -> 1. Top"), true);
  assert.equal((await repository.listRecentSessions()).length, 0);
});

test("failed analysis attempts can be persisted truthfully", async () => {
  const repository = new InMemoryAnalysisSessionRepository();
  const drill = buildDrill();

  const failed = await persistFailedUploadAnalysisSession({
    repository,
    drill,
    drillVersion: "sample-v1",
    sourceId: "upload-job-fail",
    sourceLabel: "bad-attempt.mp4",
    errorMessage: "video decode failed"
  });

  assert.equal(failed.status, "failed");
  assert.equal(failed.events.length, 0);
  assert.equal(failed.frameSamples.length, 0);

  const stored = await repository.getSessionById(failed.sessionId);
  assert.equal(stored?.debug?.errorMessage, "video decode failed");
  assert.equal(stored?.drillBinding?.drillName, "Service Drill");
});

test("completed upload with no sampled frames is persisted as partial", async () => {
  const repository = new InMemoryAnalysisSessionRepository();
  const drill = buildDrill();
  const timeline = createTimeline();
  timeline.frames = [];

  const session = await persistCompletedUploadAnalysisSession({
    repository,
    drill,
    timeline,
    sourceId: "upload-empty"
  });

  assert.equal(session.status, "partial");
  assert.equal(session.frameSamples.length, 0);
});

test("completed upload with zero analyzed duration is persisted as partial", async () => {
  const repository = new InMemoryAnalysisSessionRepository();
  const drill = buildDrill();
  const timeline = createTimeline();
  timeline.frames = [timeline.frames[0]!];

  const session = await persistCompletedUploadAnalysisSession({
    repository,
    drill,
    timeline,
    sourceId: "upload-zero-duration"
  });

  assert.equal(session.frameSamples.length > 0, true);
  assert.equal(session.summary.analyzedDurationMs, 0);
  assert.equal(session.status, "partial");
});
