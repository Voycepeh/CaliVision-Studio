import { deriveReplayOverlayStateAtTime } from "../analysis/replay-state.ts";
import { drawAnalysisOverlay, drawPoseOverlay, getNearestPoseFrame } from "../upload/overlay.ts";
import type { AnalysisSessionRecord } from "../analysis/session-repository.ts";
import type { LiveSessionTrace } from "./types.ts";

export async function exportAnnotatedReplayFromLiveTrace(input: {
  rawVideo: File;
  trace: LiveSessionTrace;
  analysisSession: AnalysisSessionRecord;
}): Promise<{ blob: Blob; mimeType: string }> {
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  const objectUrl = URL.createObjectURL(input.rawVideo);
  video.src = objectUrl;
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Unable to load recorded live video."));
  });

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    URL.revokeObjectURL(objectUrl);
    throw new Error("Canvas unavailable for live replay export.");
  }

  const stream = canvas.captureStream(30);
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });

  recorder.start(250);
  await video.play();

  await new Promise<void>((resolve) => {
    const tick = () => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const currentMs = video.currentTime * 1000;
      const frame = getNearestPoseFrame(input.trace.captures.map((capture) => capture.frame), currentMs);
      drawPoseOverlay(ctx, canvas.width, canvas.height, frame);
      drawAnalysisOverlay(ctx, canvas.width, canvas.height, deriveReplayOverlayStateAtTime(input.analysisSession, currentMs), {
        modeLabel: input.trace.drillSelection.drillBindingLabel,
        showDrillMetrics: input.trace.drillSelection.mode === "drill",
        phaseLabels: (input.trace.drillSelection.drill?.phases ?? []).reduce<Record<string, string>>((acc, phase) => {
          const label = (phase.name || phase.title || "").trim();
          if (label) {
            acc[phase.phaseId] = label;
          }
          return acc;
        }, {})
      });

      if (video.ended) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };

    tick();
  });

  recorder.stop();
  const blob = await done;
  URL.revokeObjectURL(objectUrl);
  return { blob, mimeType };
}
