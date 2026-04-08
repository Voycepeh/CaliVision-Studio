"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildBrowserRecordingFile,
  describeCameraFailure,
  detectCameraSupport,
  pickSupportedRecordingMimeType,
  requestCameraStream,
  stopMediaStream,
  type CameraCaptureStage
} from "@/lib/upload/browser-camera";
import { createUploadMediaIntake } from "@/lib/upload/media-intake";

type UploadCameraCaptureCardProps = {
  disabled?: boolean;
  onAnalyzeCapture: (file: File) => Promise<void>;
};

function stageMessage(stage: CameraCaptureStage, errorMessage: string | null): string {
  switch (stage) {
    case "requesting-permission":
      return "Requesting camera permission...";
    case "preview-ready":
      return "Preview ready. Tap Record to capture your attempt.";
    case "recording":
      return "Recording in progress...";
    case "recorded-preview":
      return "Video captured successfully. Analyze to continue in Upload Video results.";
    case "unsupported":
      return "Camera capture is unavailable in this browser/context. File upload is still available.";
    case "failed":
      return errorMessage ?? "Camera capture failed. You can retry or upload a file.";
    default:
      return "Use your mobile browser camera to record a quick attempt.";
  }
}

export function UploadCameraCaptureCard({ disabled, onAnalyzeCapture }: UploadCameraCaptureCardProps) {
  const [stage, setStage] = useState<CameraCaptureStage>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [analyzing, setAnalyzing] = useState(false);
  const [recordingFile, setRecordingFile] = useState<File | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [supportsCamera, setSupportsCamera] = useState(() => detectCameraSupport());

  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const recordedVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const statusText = useMemo(() => stageMessage(stage, errorMessage), [stage, errorMessage]);

  const resetRecordingPreview = useCallback(() => {
    setRecordingFile(null);
    setRecordingUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
  }, []);

  const releaseStream = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    const support = detectCameraSupport();
    setSupportsCamera(support);
    if (!support.supported) {
      setStage("unsupported");
    }
  }, []);

  useEffect(() => () => {
    releaseStream();
    setRecordingUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
  }, [releaseStream]);

  const handleStartCamera = useCallback(async () => {
    setErrorMessage(null);
    resetRecordingPreview();

    if (!supportsCamera.supported) {
      setStage("unsupported");
      return;
    }

    try {
      setStage("requesting-permission");
      releaseStream();
      const stream = await requestCameraStream(facingMode);
      streamRef.current = stream;
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
        await liveVideoRef.current.play();
      }
      setStage("preview-ready");
    } catch (error) {
      setErrorMessage(describeCameraFailure(error));
      setStage("failed");
    }
  }, [facingMode, releaseStream, resetRecordingPreview, supportsCamera.supported]);

  const handleStartRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;

    setErrorMessage(null);
    chunksRef.current = [];

    const mimeType = pickSupportedRecordingMimeType();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onerror = () => {
      setErrorMessage("Recording failed. Retake or upload a file instead.");
      setStage("failed");
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" });
      if (blob.size === 0) {
        setErrorMessage("No video was captured. Retake to try again.");
        setStage("failed");
        return;
      }
      const file = buildBrowserRecordingFile(blob);
      setRecordingFile(file);
      setRecordingUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return URL.createObjectURL(file);
      });
      setStage("recorded-preview");
      releaseStream();
    };

    recorder.start(250);
    recorderRef.current = recorder;
    setStage("recording");
  }, [releaseStream]);

  const handleStopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
  }, []);

  const handleRetake = useCallback(async () => {
    releaseStream();
    resetRecordingPreview();
    setStage("idle");
    await handleStartCamera();
  }, [handleStartCamera, releaseStream, resetRecordingPreview]);

  const handleAnalyzeCapture = useCallback(async () => {
    if (!recordingFile) return;
    const intake = createUploadMediaIntake({ sourceType: "browser-recording", file: recordingFile });
    setAnalyzing(true);
    try {
      await onAnalyzeCapture(intake.file);
    } finally {
      setAnalyzing(false);
    }
  }, [onAnalyzeCapture, recordingFile]);

  return (
    <section className="card upload-camera-card" style={{ margin: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <strong style={{ fontSize: "0.96rem" }}>Use Camera (mobile web)</strong>
        <button type="button" className="pill" onClick={() => setFacingMode((current) => (current === "environment" ? "user" : "environment"))} disabled={disabled || stage === "recording" || stage === "requesting-permission"}>
          {facingMode === "environment" ? "Rear camera" : "Front camera"}
        </button>
      </div>

      <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.83rem" }}>{statusText}</p>

      {stage !== "recorded-preview" ? (
        <video ref={liveVideoRef} muted playsInline className="upload-camera-preview" />
      ) : (
        <video ref={recordedVideoRef} src={recordingUrl ?? undefined} controls playsInline className="upload-camera-preview" />
      )}

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {(stage === "idle" || stage === "failed" || stage === "unsupported") ? (
          <button type="button" className="upload-camera-primary-cta" onClick={() => void handleStartCamera()} disabled={disabled || stage === "unsupported"}>
            Use Camera
          </button>
        ) : null}

        {stage === "preview-ready" ? (
          <button type="button" className="upload-camera-primary-cta" onClick={handleStartRecording} disabled={disabled}>
            Record attempt
          </button>
        ) : null}

        {stage === "recording" ? (
          <button type="button" className="upload-camera-primary-cta" onClick={handleStopRecording} disabled={disabled}>
            Stop recording
          </button>
        ) : null}

        {stage === "recorded-preview" ? (
          <>
            <button type="button" className="upload-camera-primary-cta" onClick={() => void handleAnalyzeCapture()} disabled={disabled || analyzing}>
              {analyzing ? "Starting analysis..." : "Analyze captured video"}
            </button>
            <button type="button" className="pill" onClick={() => void handleRetake()} disabled={disabled || analyzing}>
              Retake
            </button>
          </>
        ) : null}

        {(stage === "preview-ready" || stage === "recording") ? (
          <button type="button" className="pill" onClick={() => { releaseStream(); setStage("idle"); }} disabled={disabled || analyzing}>
            Cancel
          </button>
        ) : null}
      </div>
    </section>
  );
}
