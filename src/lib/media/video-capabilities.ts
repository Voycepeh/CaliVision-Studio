export type BrowserMediaCapabilities = {
  capture: {
    preferredMimeType: string;
    preferredExtension: string;
    supportedMimeTypes: string[];
  };
  processing: {
    preferredMimeType: string;
    preferredExtension: string;
  };
  playback: {
    mp4: boolean;
    webm: boolean;
  };
  delivery: {
    preferredFamily: "mp4" | "webm";
    allowWebmUserDelivery: boolean;
  };
};

type CapabilityEnv = {
  mediaRecorderIsTypeSupported?: (mimeType: string) => boolean;
  canPlayType?: (mimeType: string) => boolean;
};

const MP4_CANDIDATES = ["video/mp4;codecs=avc1.42E01E", "video/mp4"];
const WEBM_CANDIDATES = ["video/webm;codecs=vp9", "video/webm"];

function defaultEnv(): CapabilityEnv {
  const mediaRecorderIsTypeSupported =
    typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function"
      ? (mimeType: string) => MediaRecorder.isTypeSupported(mimeType)
      : undefined;

  const canPlayType =
    typeof document !== "undefined"
      ? (mimeType: string) => {
          const video = document.createElement("video");
          const result = video.canPlayType(mimeType);
          return result === "probably" || result === "maybe";
        }
      : undefined;

  return {
    mediaRecorderIsTypeSupported,
    canPlayType
  };
}

export function isMp4LikeMimeType(mimeType?: string | null): boolean {
  if (!mimeType) return false;
  return mimeType.toLowerCase().includes("video/mp4") || mimeType.toLowerCase().includes("avc1");
}

export function isWebmMimeType(mimeType?: string | null): boolean {
  if (!mimeType) return false;
  return mimeType.toLowerCase().includes("video/webm");
}

export function extensionForVideoMimeType(mimeType?: string | null): "mp4" | "webm" {
  return isMp4LikeMimeType(mimeType) ? "mp4" : "webm";
}

export function buildBrowserMediaCapabilities(envOverrides?: CapabilityEnv): BrowserMediaCapabilities {
  const env = { ...defaultEnv(), ...envOverrides };
  const supportedRecorderMimeTypes = [...MP4_CANDIDATES, ...WEBM_CANDIDATES].filter(
    (candidate) => env.mediaRecorderIsTypeSupported?.(candidate) ?? false
  );
  const preferredCaptureMimeType = supportedRecorderMimeTypes[0] ?? "video/webm";
  const playbackMp4 = env.canPlayType?.("video/mp4") ?? false;
  const playbackWebm = env.canPlayType?.("video/webm") ?? false;

  return {
    capture: {
      preferredMimeType: preferredCaptureMimeType,
      preferredExtension: extensionForVideoMimeType(preferredCaptureMimeType),
      supportedMimeTypes: supportedRecorderMimeTypes
    },
    processing: {
      preferredMimeType: preferredCaptureMimeType,
      preferredExtension: extensionForVideoMimeType(preferredCaptureMimeType)
    },
    playback: {
      mp4: playbackMp4,
      webm: playbackWebm
    },
    delivery: {
      preferredFamily: playbackMp4 ? "mp4" : "webm",
      allowWebmUserDelivery: playbackWebm
    }
  };
}

export function canPlayVideoMimeType(mimeType: string | null | undefined, envOverrides?: CapabilityEnv): boolean {
  if (!mimeType) return false;
  const env = { ...defaultEnv(), ...envOverrides };
  return env.canPlayType?.(mimeType) ?? false;
}

export function isUserFacingDeliveryAllowed(mimeType: string | null | undefined, envOverrides?: CapabilityEnv): boolean {
  if (!mimeType) return false;
  if (isMp4LikeMimeType(mimeType)) {
    return true;
  }
  if (isWebmMimeType(mimeType)) {
    const env = { ...defaultEnv(), ...envOverrides };
    return env.canPlayType?.("video/webm") ?? false;
  }
  return canPlayVideoMimeType(mimeType, envOverrides);
}
