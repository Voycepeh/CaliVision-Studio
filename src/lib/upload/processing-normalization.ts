export type VideoDiagnostics = {
  width?: number;
  height?: number;
  durationMs?: number;
  fps?: number;
  codec?: string;
  rotationMetadata?: number;
  colorTransfer?: string;
  isHdrSource?: boolean;
  hasSuspiciousMetadata: boolean;
};

export type NormalizedOutputMetadata = {
  durationMs?: number;
  width?: number;
  height?: number;
};

export type NormalizedOutputValidationResult =
  | {
      ok: true;
      diagnostics: {
        sourceDurationMs?: number;
        normalizedDurationMs: number;
        width: number;
        height: number;
        durationDriftMs?: number;
        driftPct?: number;
        driftCheckSkipped: boolean;
      };
    }
  | {
      ok: false;
      reason: "invalid-metadata" | "duration-drift";
      details: {
        sourceDurationMs?: number;
        normalizedDurationMs?: number;
        durationDriftMs?: number;
        driftPct?: number;
        width?: number;
        height?: number;
        allowedDriftMs?: number;
      };
    };

export function validateNormalizedOutput(
  sourceDiagnostics: Pick<VideoDiagnostics, "durationMs">,
  normalizedMetadata: NormalizedOutputMetadata
): NormalizedOutputValidationResult {
  const sourceDurationMs = sourceDiagnostics.durationMs;
  const normalizedDurationMs = normalizedMetadata.durationMs;
  const width = normalizedMetadata.width;
  const height = normalizedMetadata.height;
  const hasValidDuration =
    typeof normalizedDurationMs === "number" && Number.isFinite(normalizedDurationMs) && normalizedDurationMs > 0;
  const hasValidDimensions = typeof width === "number" && width > 0 && typeof height === "number" && height > 0;
  const hasValidSourceDuration = typeof sourceDurationMs === "number" && Number.isFinite(sourceDurationMs) && sourceDurationMs > 0;

  if (!hasValidDuration || !hasValidDimensions) {
    return {
      ok: false,
      reason: "invalid-metadata",
      details: {
        sourceDurationMs,
        normalizedDurationMs,
        width,
        height
      }
    };
  }

  if (hasValidSourceDuration) {
    const durationDriftMs = Math.abs(normalizedDurationMs - sourceDurationMs);
    const allowedDriftMs = Math.max(1000, Math.round(sourceDurationMs * 0.05));
    const driftPct = (durationDriftMs / sourceDurationMs) * 100;

    if (durationDriftMs > allowedDriftMs) {
      return {
        ok: false,
        reason: "duration-drift",
        details: {
          sourceDurationMs,
          normalizedDurationMs,
          durationDriftMs,
          driftPct,
          width,
          height,
          allowedDriftMs
        }
      };
    }

    return {
      ok: true,
      diagnostics: {
        sourceDurationMs,
        normalizedDurationMs,
        width,
        height,
        durationDriftMs,
        driftPct,
        driftCheckSkipped: false
      }
    };
  }

  return {
    ok: true,
    diagnostics: {
      normalizedDurationMs,
      width,
      height,
      driftCheckSkipped: true
    }
  };
}

export function shouldNormalize(file: File, diagnostics: VideoDiagnostics): { required: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const mimeType = file.type.toLowerCase();
  const fileName = file.name.toLowerCase();
  const width = diagnostics.width ?? 0;
  const height = diagnostics.height ?? 0;
  const isPortrait = width > 0 && height > 0 && height > width;
  const codec = diagnostics.codec?.toLowerCase() ?? "";
  const hasKnownBrowserFriendlyCodec =
    codec.includes("avc") || codec.includes("h264") || codec.includes("avc1") || codec.includes("vp8") || codec.includes("vp9");
  const hasIncompleteOrSuspiciousDiagnostics = diagnostics.hasSuspiciousMetadata || (!codec && !hasKnownBrowserFriendlyCodec);
  const isQuickTimeFamilyUpload = mimeType.includes("video/quicktime") || mimeType.includes("quicktime") || fileName.endsWith(".mov");
  const isGenericMp4Upload = mimeType === "video/mp4" || mimeType.startsWith("video/mp4;");

  if (isPortrait && typeof diagnostics.rotationMetadata === "number" && diagnostics.rotationMetadata % 360 !== 0) {
    reasons.push("portrait source has non-zero rotation metadata");
  }

  if (diagnostics.isHdrSource) {
    reasons.push("HDR/HLG transfer detected or inferred");
  }

  if (codec.includes("hevc") || codec.includes("hvc1") || codec.includes("hev1") || codec.includes("h265")) {
    reasons.push("HEVC/H.265 decoder-fragile source");
  }

  if (diagnostics.hasSuspiciousMetadata) {
    reasons.push("suspicious or incomplete metadata");
  }

  if (isQuickTimeFamilyUpload && hasIncompleteOrSuspiciousDiagnostics) {
    reasons.push("QuickTime-family upload with ambiguous diagnostics");
  }

  if (isGenericMp4Upload && hasIncompleteOrSuspiciousDiagnostics && !hasKnownBrowserFriendlyCodec) {
    reasons.push("generic mp4 upload with incomplete source diagnostics");
  }

  if (!file.type) {
    reasons.push("missing mime type metadata");
  }

  return { required: reasons.length > 0, reasons };
}

export function isSeekTimeoutDuringPoseSampling(error: unknown): boolean {
  const message = extractErrorLikeMessage(error);
  if (!message) {
    return false;
  }
  return /video seek timed out during pose sampling/i.test(message);
}

function extractErrorLikeMessage(error: unknown): string | null {
  if (typeof error === "string") {
    return error;
  }

  if (!error || typeof error !== "object") {
    return null;
  }

  const candidate = error as { message?: unknown; cause?: unknown };
  if (typeof candidate.message === "string") {
    return candidate.message;
  }

  if (candidate.cause) {
    return extractErrorLikeMessage(candidate.cause);
  }

  return null;
}
