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
  if (!(error instanceof Error)) {
    return false;
  }
  return /Video seek timed out during pose sampling\./i.test(error.message);
}
