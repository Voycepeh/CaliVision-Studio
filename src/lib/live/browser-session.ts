export type CameraSupportStatus = "supported" | "unsupported";

export function getCameraSupportStatus(windowLike: {
  navigator?: { mediaDevices?: { getUserMedia?: unknown } };
  MediaRecorder?: unknown;
}): CameraSupportStatus {
  const hasMediaDevices = Boolean(windowLike.navigator?.mediaDevices?.getUserMedia);
  const hasRecorder = Boolean(windowLike.MediaRecorder);
  return hasMediaDevices && hasRecorder ? "supported" : "unsupported";
}

export function classifyCameraError(error: unknown): "denied" | "unsupported" | "failed" {
  if (!(error instanceof Error)) {
    return "failed";
  }

  const normalized = `${error.name}:${error.message}`.toLowerCase();
  if (normalized.includes("notallowed") || normalized.includes("permission") || normalized.includes("securityerror")) {
    return "denied";
  }
  if (normalized.includes("notfound") || normalized.includes("overconstrained") || normalized.includes("notreadable")) {
    return "unsupported";
  }
  return "failed";
}

export async function stopMediaStream(stream: MediaStream | null | undefined): Promise<void> {
  if (!stream) {
    return;
  }

  for (const track of stream.getTracks()) {
    track.stop();
  }
}
