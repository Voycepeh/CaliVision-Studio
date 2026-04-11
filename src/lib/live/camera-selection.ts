import { getHardwareZoomSupport, type HardwareZoomSupport, type ZoomTrackLike } from "./hardware-zoom.ts";

export type CameraFacingInference = "rear" | "front" | "unknown";
export type RearLensHint = "ultrawide" | "main" | "telephoto" | "unknown";

export type VideoInputDescriptor = {
  deviceId: string;
  label: string;
  facing: CameraFacingInference;
  rearLensHint: RearLensHint;
  zoomSupport: HardwareZoomSupport;
};

export type RearCameraZoomDecision =
  | { strategy: "hardware-zoom"; reason: "active-track-supports-preset" }
  | { strategy: "switch-camera"; reason: "ultrawide-rear-camera"; camera: VideoInputDescriptor }
  | { strategy: "unavailable"; reason: string };

export type CurrentTrackZoomInfo = {
  deviceId?: string;
  facing: CameraFacingInference;
  zoomSupport: HardwareZoomSupport;
};

const ZOOM_TOLERANCE = 0.01;
type PtzAwareTrackConstraints = MediaTrackConstraints & { pan?: ConstrainDouble; tilt?: ConstrainDouble; zoom?: ConstrainDouble };

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}

export async function listAvailableVideoInputs(mediaDevices: MediaDevices = navigator.mediaDevices): Promise<MediaDeviceInfo[]> {
  const devices = await mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === "videoinput");
}

export function inferCameraFacingFromLabelOrSettings(label: string, settings?: MediaTrackSettings): CameraFacingInference {
  const normalized = normalizeLabel(label);
  if (normalized.includes("front") || normalized.includes("user") || normalized.includes("facetime")) {
    return "front";
  }
  if (
    normalized.includes("back") ||
    normalized.includes("rear") ||
    normalized.includes("environment") ||
    normalized.includes("world") ||
    normalized.includes("traseira") ||
    normalized.includes("trasera")
  ) {
    return "rear";
  }

  const facingMode = settings?.facingMode;
  if (facingMode === "user") {
    return "front";
  }
  if (facingMode === "environment") {
    return "rear";
  }
  return "unknown";
}

function inferRearLensHintFromLabel(label: string): RearLensHint {
  const normalized = normalizeLabel(label);
  if (normalized.includes("ultra") || normalized.includes("wide") || normalized.includes("0.5") || normalized.includes("0,5")) {
    return "ultrawide";
  }
  if (normalized.includes("tele") || normalized.includes("zoom") || normalized.includes("periscope")) {
    return "telephoto";
  }
  if (normalized.includes("main") || normalized.includes("standard") || normalized.includes("1x")) {
    return "main";
  }
  return "unknown";
}

export async function probeVideoDeviceCapabilities(
  deviceId: string,
  options?: { getUserMedia?: typeof navigator.mediaDevices.getUserMedia }
): Promise<Pick<VideoInputDescriptor, "zoomSupport" | "facing">> {
  const getUserMedia = options?.getUserMedia ?? navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  const ptzDeviceConstraints: PtzAwareTrackConstraints = {
    deviceId: { exact: deviceId },
    pan: { ideal: 0 },
    tilt: { ideal: 0 },
    zoom: { ideal: 1 }
  };
  const stream = await getUserMedia({
    video: { ...ptzDeviceConstraints },
    audio: false
  });

  const track = stream.getVideoTracks()[0] ?? null;
  const zoomSupport = getHardwareZoomSupport(track as ZoomTrackLike);
  const settings = track?.getSettings?.() ?? undefined;
  const facing = inferCameraFacingFromLabelOrSettings("", settings);
  for (const streamTrack of stream.getTracks()) {
    if (streamTrack.readyState !== "ended") {
      streamTrack.stop();
    }
  }
  return {
    zoomSupport,
    facing
  };
}

export async function buildVideoInputDescriptors(
  options?: {
    mediaDevices?: MediaDevices;
    probeDevice?: (deviceId: string) => Promise<Pick<VideoInputDescriptor, "zoomSupport" | "facing">>;
  }
): Promise<VideoInputDescriptor[]> {
  const mediaDevices = options?.mediaDevices ?? navigator.mediaDevices;
  const probeDevice = options?.probeDevice ?? ((deviceId: string) => probeVideoDeviceCapabilities(deviceId));
  const devices = await listAvailableVideoInputs(mediaDevices);

  const descriptors: VideoInputDescriptor[] = [];
  for (const device of devices) {
    let probeFacing: CameraFacingInference = "unknown";
    let zoomSupport: HardwareZoomSupport = { supported: false };
    try {
      const probe = await probeDevice(device.deviceId);
      probeFacing = probe.facing;
      zoomSupport = probe.zoomSupport;
    } catch {
      // Keep this conservative. Some browsers block probing by deviceId.
    }

    const labelFacing = inferCameraFacingFromLabelOrSettings(device.label);
    descriptors.push({
      deviceId: device.deviceId,
      label: device.label,
      facing: probeFacing !== "unknown" ? probeFacing : labelFacing,
      rearLensHint: inferRearLensHintFromLabel(device.label),
      zoomSupport
    });
  }

  return descriptors;
}

export async function stopStreamTracks(stream: MediaStream | null | undefined): Promise<void> {
  if (!stream) {
    return;
  }
  for (const track of stream.getTracks()) {
    if (track.readyState !== "ended") {
      track.stop();
    }
  }
}

export async function replaceStreamSafely(
  previousStream: MediaStream | null | undefined,
  nextStream: MediaStream,
  stopPrevious: (stream: MediaStream | null | undefined) => Promise<void> = stopStreamTracks
): Promise<MediaStream> {
  await stopPrevious(previousStream);
  return nextStream;
}

function supportsPreset(zoomSupport: HardwareZoomSupport, preset: number): boolean {
  if (!zoomSupport.supported) {
    return false;
  }
  return zoomSupport.min - ZOOM_TOLERANCE <= preset && preset <= zoomSupport.max + ZOOM_TOLERANCE;
}

export function chooseBestRearCameraForZoomPreset(
  preset: number,
  candidates: VideoInputDescriptor[],
  currentTrackInfo: CurrentTrackZoomInfo
): RearCameraZoomDecision {
  if (supportsPreset(currentTrackInfo.zoomSupport, preset)) {
    return { strategy: "hardware-zoom", reason: "active-track-supports-preset" };
  }

  if (preset !== 0.5) {
    return { strategy: "unavailable", reason: "preset_not_supported_on_active_track" };
  }

  if (currentTrackInfo.facing !== "rear") {
    return { strategy: "unavailable", reason: "front_camera_selected" };
  }

  const rearCandidates = candidates.filter((candidate) => candidate.facing === "rear" && candidate.deviceId !== currentTrackInfo.deviceId);
  const confidentUltrawide = rearCandidates.filter((candidate) => candidate.rearLensHint === "ultrawide");

  if (confidentUltrawide.length === 1) {
    return { strategy: "switch-camera", reason: "ultrawide-rear-camera", camera: confidentUltrawide[0] };
  }

  if (confidentUltrawide.length > 1) {
    return { strategy: "unavailable", reason: "multiple_ultrawide_candidates" };
  }

  return { strategy: "unavailable", reason: "no_confident_ultrawide_candidate" };
}
