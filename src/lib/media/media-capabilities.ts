export type DeliveryFormat = "mp4" | "webm" | "unknown";

export type MediaSourceOption = {
  id: "raw" | "annotated";
  mimeType?: string | null;
  url: string;
};

export type PreviewSelectionResult = {
  source: MediaSourceOption | null;
  blockedByCompatibility: boolean;
  warning: string | null;
};

const MP4_RECORDER_CANDIDATES = ["video/mp4;codecs=avc1.42E01E", "video/mp4"];
const WEBM_RECORDER_CANDIDATES = ["video/webm;codecs=vp9", "video/webm"];

function normalizeMimeType(mimeType?: string | null): string {
  return (mimeType ?? "").trim().toLowerCase();
}

export function detectDeliveryFormat(mimeType?: string | null): DeliveryFormat {
  const normalized = normalizeMimeType(mimeType);
  if (normalized.includes("mp4")) return "mp4";
  if (normalized.includes("webm")) return "webm";
  return "unknown";
}

export function extensionFromMimeType(mimeType?: string | null): "mp4" | "webm" | "bin" {
  const format = detectDeliveryFormat(mimeType);
  if (format === "mp4") return "mp4";
  if (format === "webm") return "webm";
  return "bin";
}

export function isMediaRecorderTypeSupported(
  mimeType: string,
  isTypeSupported: (candidate: string) => boolean = (candidate) =>
    typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(candidate)
): boolean {
  try {
    return isTypeSupported(mimeType);
  } catch {
    return false;
  }
}

export function isLikelyAppleSafariEnvironment(ua: string = typeof navigator === "undefined" ? "" : navigator.userAgent): boolean {
  const lower = ua.toLowerCase();
  const isSafariEngine = lower.includes("safari") && !lower.includes("chrome") && !lower.includes("crios") && !lower.includes("android");
  const isAppleDevice = /iphone|ipad|ipod|macintosh/.test(lower);
  return isSafariEngine || (isAppleDevice && !lower.includes("firefox"));
}

export function canLikelyPlayMimeType(
  mimeType: string,
  canPlayType: (candidate: string) => string = (candidate) => {
    if (typeof document === "undefined") return "";
    const probe = document.createElement("video");
    return probe.canPlayType(candidate);
  }
): boolean {
  try {
    const verdict = canPlayType(mimeType);
    return verdict === "probably" || verdict === "maybe";
  } catch {
    return false;
  }
}

export function selectPreferredCaptureMimeType(
  isTypeSupported?: (candidate: string) => boolean
): string {
  for (const candidate of [...MP4_RECORDER_CANDIDATES, ...WEBM_RECORDER_CANDIDATES]) {
    if (isMediaRecorderTypeSupported(candidate, isTypeSupported)) {
      return candidate;
    }
  }
  return "video/webm";
}

export function selectPreviewSource(options: {
  preferredId: "raw" | "annotated";
  sources: MediaSourceOption[];
  isAppleLike?: boolean;
  canPlayType?: (candidate: string) => string;
}): PreviewSelectionResult {
  const preferred = options.sources.find((source) => source.id === options.preferredId) ?? null;
  const fallback = options.sources.find((source) => source.id !== options.preferredId) ?? null;
  const appleLike = options.isAppleLike ?? isLikelyAppleSafariEnvironment();

  const evaluate = (source: MediaSourceOption | null) => {
    if (!source) return false;
    if (!source.mimeType) return true;
    const format = detectDeliveryFormat(source.mimeType);
    if (format !== "webm") return true;
    if (!appleLike) return true;
    return canLikelyPlayMimeType(source.mimeType, options.canPlayType);
  };

  if (evaluate(preferred)) {
    return { source: preferred, blockedByCompatibility: false, warning: null };
  }
  if (evaluate(fallback)) {
    return {
      source: fallback,
      blockedByCompatibility: true,
      warning: "This browser may not play WebM reliably. Showing a compatible preview instead."
    };
  }

  return {
    source: null,
    blockedByCompatibility: true,
    warning: "This browser may not play WebM reliably. Video preview is unavailable on this device."
  };
}


export function selectPreferredDeliverySource(sources: MediaSourceOption[], options?: { isAppleLike?: boolean; canPlayType?: (candidate: string) => string }): MediaSourceOption | null {
  const appleLike = options?.isAppleLike ?? isLikelyAppleSafariEnvironment();
  const mp4 = sources.find((source) => detectDeliveryFormat(source.mimeType) === "mp4") ?? null;
  if (mp4) {
    return mp4;
  }
  const firstPlayableWebm = sources.find((source) => {
    if (detectDeliveryFormat(source.mimeType) !== "webm") return false;
    if (!appleLike) return true;
    return canLikelyPlayMimeType(source.mimeType ?? "video/webm", options?.canPlayType);
  }) ?? null;
  return firstPlayableWebm ?? sources[0] ?? null;
}

export function resolveSafeDelivery(options: {
  mimeType?: string | null;
  isAppleLike?: boolean;
  canPlayType?: (candidate: string) => string;
}): { downloadable: boolean; warning: string | null; format: DeliveryFormat } {
  const format = detectDeliveryFormat(options.mimeType);
  const appleLike = options.isAppleLike ?? isLikelyAppleSafariEnvironment();

  if (format !== "webm") {
    return { downloadable: true, warning: null, format };
  }

  if (!appleLike || canLikelyPlayMimeType(options.mimeType ?? "video/webm", options.canPlayType)) {
    return { downloadable: true, warning: null, format };
  }

  return {
    downloadable: false,
    format,
    warning: "WebM download may not play on this Apple/Safari browser."
  };
}
