export type CameraCaptureStage =
  | "idle"
  | "requesting-permission"
  | "preview-ready"
  | "recording"
  | "recorded-preview"
  | "failed"
  | "unsupported";

export type CameraSupport = {
  supported: boolean;
  reason?: "insecure-context" | "missing-media-devices" | "missing-media-recorder";
};

const RECORDER_MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm"
] as const;

export function detectCameraSupport(): CameraSupport {
  if (typeof window === "undefined") {
    return { supported: false, reason: "missing-media-devices" };
  }
  if (!window.isSecureContext) {
    return { supported: false, reason: "insecure-context" };
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return { supported: false, reason: "missing-media-devices" };
  }
  if (typeof MediaRecorder === "undefined") {
    return { supported: false, reason: "missing-media-recorder" };
  }
  return { supported: true };
}

export function pickSupportedRecordingMimeType(
  canUseType: (candidate: string) => boolean = (candidate) => MediaRecorder.isTypeSupported(candidate)
): string | undefined {
  return RECORDER_MIME_CANDIDATES.find((candidate) => canUseType(candidate));
}

export function buildBrowserRecordingFile(blob: Blob, now: Date = new Date()): File {
  const timestamp = now.toISOString().replace(/[.:]/g, "-");
  const extension = blob.type.includes("mp4") ? "mp4" : "webm";
  return new File([blob], `upload-camera-${timestamp}.${extension}`, {
    type: blob.type || "video/webm",
    lastModified: now.getTime()
  });
}

export function stopMediaStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

export async function requestCameraStream(facingMode: "user" | "environment"): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  });
}

export function describeCameraFailure(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "Camera access was denied. Allow permission or use file upload instead.";
    }
    if (error.name === "NotFoundError" || error.name === "OverconstrainedError") {
      return "No compatible camera was found on this device.";
    }
  }
  return "Unable to access camera capture right now. You can still upload a video file.";
}
