export type UploadCompatibilityLevel = "supported" | "risky" | "unsupported";

export type UploadPreflightDecision = "normalize" | "try_anyway" | "cancel";

export type UploadCompatibilitySignals = {
  fileName: string;
  mimeType: string;
  width?: number;
  height?: number;
  durationMs?: number;
  fps?: number;
  codec?: string;
  audioCodec?: string;
  bitDepth?: number;
  colorTransfer?: string;
  isHdr?: boolean;
  rotationMetadata?: number;
};

export type UploadCompatibilityReport = {
  level: UploadCompatibilityLevel;
  reasons: string[];
  detected: {
    extension: string;
    container: string;
    mimeType: string;
    codec?: string;
    audioCodec?: string;
    fps?: number;
    bitDepth?: number;
    colorTransfer?: string;
    rotationMetadata?: number;
  };
};

const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "m4v", "webm", "mkv", "avi", "mpeg", "mpg", "3gp", "3gpp"]);

function extensionFromFileName(name: string): string {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

function inferContainer(extension: string, mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("quicktime") || extension === "mov") return "mov";
  if (normalized.includes("mp4") || extension === "mp4" || extension === "m4v") return "mp4";
  if (normalized.includes("webm") || extension === "webm") return "webm";
  if (normalized.includes("x-matroska") || extension === "mkv") return "mkv";
  if (normalized.includes("3gpp") || extension === "3gp" || extension === "3gpp") return "3gpp";
  return extension || "unknown";
}

function looksLikeVideo(extension: string, mimeType: string): boolean {
  if (mimeType.toLowerCase().startsWith("video/")) {
    return true;
  }
  return VIDEO_EXTENSIONS.has(extension);
}

function extractCodecsFromMimeType(mimeType: string): { videoCodec?: string; audioCodec?: string } {
  const codecsMatch = mimeType.match(/codecs\s*=\s*"?([^";]+)"?/i);
  const parts = codecsMatch?.[1]
    ?.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean) ?? [];

  let videoCodec = parts.find((codec) => /avc|h264|hev|h265|hvc|vp8|vp9|av01/.test(codec));
  let audioCodec = parts.find((codec) => /mp4a|aac|opus|vorbis|ac-3|ec-3/.test(codec));

  const normalized = mimeType.toLowerCase();
  if (!videoCodec) {
    if (/(hevc|hvc1|hev1|h265)/.test(normalized)) videoCodec = "hevc";
    if (/(avc|h264|avc1)/.test(normalized)) videoCodec = "h264";
  }
  if (!audioCodec) {
    if (/(aac|mp4a)/.test(normalized)) audioCodec = "aac";
  }

  return { videoCodec, audioCodec };
}

function inferBitDepth(fileName: string, mimeType: string, codec?: string): number | undefined {
  const combined = `${fileName} ${mimeType} ${codec ?? ""}`.toLowerCase();
  if (/(10\s*-?bit|main\s*10|yuv420p10|p010|10bit)/.test(combined)) {
    return 10;
  }
  if (/(12\s*-?bit|12bit)/.test(combined)) {
    return 12;
  }
  return undefined;
}

function inferHdr(fileName: string, mimeType: string, colorTransfer?: string): boolean {
  const combined = `${fileName} ${mimeType} ${colorTransfer ?? ""}`.toLowerCase();
  return /(hdr|hlg|pq|bt2020|dolby\s*vision|dvhe)/.test(combined);
}

function roundFps(fps?: number): number | undefined {
  if (!Number.isFinite(fps)) {
    return undefined;
  }
  return Math.round((fps ?? 0) * 100) / 100;
}

export function classifyUploadCompatibility(signals: UploadCompatibilitySignals): UploadCompatibilityReport {
  const extension = extensionFromFileName(signals.fileName);
  const container = inferContainer(extension, signals.mimeType);
  const mimeType = signals.mimeType || "unknown";
  const parsedCodecs = extractCodecsFromMimeType(signals.mimeType);
  const codec = (signals.codec ?? parsedCodecs.videoCodec)?.toLowerCase();
  const audioCodec = (signals.audioCodec ?? parsedCodecs.audioCodec)?.toLowerCase();
  const bitDepth = signals.bitDepth ?? inferBitDepth(signals.fileName, signals.mimeType, codec);
  const fps = roundFps(signals.fps);
  const isHdr = signals.isHdr ?? inferHdr(signals.fileName, signals.mimeType, signals.colorTransfer);

  if (!looksLikeVideo(extension, signals.mimeType)) {
    return {
      level: "unsupported",
      reasons: ["not a recognized video file"],
      detected: {
        extension,
        container,
        mimeType,
        codec,
        audioCodec,
        fps,
        bitDepth,
        colorTransfer: signals.colorTransfer,
        rotationMetadata: signals.rotationMetadata
      }
    };
  }

  const reasons: string[] = [];
  if (codec && /(hevc|hvc1|hev1|h265)/.test(codec)) {
    reasons.push("HEVC/H.265 codec");
  }
  if (typeof bitDepth === "number" && bitDepth >= 10) {
    reasons.push(`${bitDepth}-bit color`);
  }
  if (isHdr) {
    reasons.push("HDR/HLG source metadata");
  }
  if (typeof fps === "number" && fps >= 100) {
    reasons.push(`high frame rate (${Math.round(fps)} fps)`);
  }
  if (container === "mov") {
    reasons.push("QuickTime/MOV container can include fragile metadata");
  }

  const hasSuspiciousMetadata =
    !signals.mimeType
    || !signals.width
    || !signals.height
    || !signals.durationMs
    || signals.durationMs <= 0
    || !codec;

  if (hasSuspiciousMetadata) {
    reasons.push("incomplete or low-confidence metadata");
  }

  const isOfficiallySupported =
    container === "mp4"
    && Boolean(codec && /(avc|h264|avc1)/.test(codec))
    && (!audioCodec || /(aac|mp4a)/.test(audioCodec))
    && (!fps || [24, 25, 30, 50, 60].some((target) => Math.abs(fps - target) <= 2))
    && (!bitDepth || bitDepth <= 8)
    && !isHdr
    && !hasSuspiciousMetadata;

  return {
    level: isOfficiallySupported ? "supported" : "risky",
    reasons,
    detected: {
      extension,
      container,
      mimeType,
      codec,
      audioCodec,
      fps,
      bitDepth,
      colorTransfer: signals.colorTransfer,
      rotationMetadata: signals.rotationMetadata
    }
  };
}

async function estimateFrameRate(file: File): Promise<number | undefined> {
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  const objectUrl = URL.createObjectURL(file);
  video.src = objectUrl;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Unable to read video metadata."));
    });

    if (!("requestVideoFrameCallback" in video)) {
      return undefined;
    }

    const rvfcVideo = video as HTMLVideoElement & { requestVideoFrameCallback: (callback: (_now: number, metadata: { mediaTime?: number }) => void) => number };
    const mediaTimes: number[] = [];
    const maxSamples = 36;

    await video.play().catch(() => undefined);

    await new Promise<void>((resolve) => {
      const startedAt = performance.now();
      const stop = () => {
        video.pause();
        resolve();
      };

      const tick = (_now: number, metadata: { mediaTime?: number }) => {
        if (typeof metadata.mediaTime === "number") {
          mediaTimes.push(metadata.mediaTime);
        }
        const elapsed = performance.now() - startedAt;
        if (mediaTimes.length >= maxSamples || elapsed > 1200 || video.ended) {
          stop();
          return;
        }
        rvfcVideo.requestVideoFrameCallback(tick);
      };

      rvfcVideo.requestVideoFrameCallback(tick);
      setTimeout(stop, 1300);
    });

    if (mediaTimes.length < 3) {
      return undefined;
    }

    const deltas: number[] = [];
    for (let i = 1; i < mediaTimes.length; i += 1) {
      const delta = mediaTimes[i] - mediaTimes[i - 1];
      if (delta > 0 && Number.isFinite(delta)) {
        deltas.push(delta);
      }
    }
    if (deltas.length === 0) {
      return undefined;
    }
    const medianDelta = deltas.sort((a, b) => a - b)[Math.floor(deltas.length / 2)] ?? 0;
    if (medianDelta <= 0) {
      return undefined;
    }
    return 1 / medianDelta;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function inspectUploadCompatibility(file: File): Promise<UploadCompatibilityReport> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  video.src = objectUrl;

  try {
    await new Promise<void>((resolve) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => resolve();
    });

    const fps = await estimateFrameRate(file).catch(() => undefined);
    return classifyUploadCompatibility({
      fileName: file.name,
      mimeType: file.type,
      width: video.videoWidth || undefined,
      height: video.videoHeight || undefined,
      durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : undefined,
      fps
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
