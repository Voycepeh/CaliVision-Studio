import type { PortableAssetRef, PortableDrill } from "@/lib/schema/contracts";

export type DrillThumbnailSource = "uploaded" | "generated" | "fallback";
export const DRILL_THUMBNAIL_TARGET_WIDTH = 1200;
export const DRILL_THUMBNAIL_TARGET_HEIGHT = 675;
export const DRILL_THUMBNAIL_MAX_INPUT_BYTES = 20 * 1024 * 1024;
export const DRILL_THUMBNAIL_MAX_STORED_BYTES = 450 * 1024;

export type ResolvedDrillThumbnail = {
  src: string;
  source: DrillThumbnailSource;
};

export type ThumbnailCropRect = {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
};

function isRenderableUri(uri: string | undefined): uri is string {
  if (!uri) return false;
  return uri.startsWith("data:") || uri.startsWith("http://") || uri.startsWith("https://") || uri.startsWith("blob:");
}

function toAssetMap(assets: PortableAssetRef[]): Record<string, PortableAssetRef> {
  return Object.fromEntries(assets.map((asset) => [asset.assetId, asset]));
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

export function computeThumbnailCropRect(sourceWidth: number, sourceHeight: number): ThumbnailCropRect {
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
    return { sx: 0, sy: 0, sw: DRILL_THUMBNAIL_TARGET_WIDTH, sh: DRILL_THUMBNAIL_TARGET_HEIGHT };
  }

  const targetRatio = DRILL_THUMBNAIL_TARGET_WIDTH / DRILL_THUMBNAIL_TARGET_HEIGHT;
  const sourceRatio = sourceWidth / sourceHeight;

  if (sourceRatio > targetRatio) {
    const sw = Math.round(sourceHeight * targetRatio);
    const sx = Math.max(0, Math.round((sourceWidth - sw) / 2));
    return { sx, sy: 0, sw, sh: Math.round(sourceHeight) };
  }

  const sh = Math.round(sourceWidth / targetRatio);
  const sy = Math.max(0, Math.round((sourceHeight - sh) / 2));
  return { sx: 0, sy, sw: Math.round(sourceWidth), sh };
}

export function estimateDataUriByteSize(dataUri: string): number {
  const [, payload = ""] = dataUri.split(",", 2);
  if (!payload) return 0;
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

export function buildGeneratedThumbnailDataUri(drill: Pick<PortableDrill, "title" | "drillType" | "difficulty" | "primaryView" | "phases">): string {
  const title = escapeXml(drill.title.trim() || "Untitled drill");
  const subtitle = `${drill.drillType.toUpperCase()} • ${drill.difficulty} • ${drill.primaryView} view • ${drill.phases.length} phases`;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" role="img" aria-label="${title}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#1d4ed8" />
    </linearGradient>
  </defs>
  <rect width="1200" height="675" fill="url(#bg)" />
  <rect x="36" y="36" width="1128" height="603" rx="28" fill="rgba(15,23,42,0.42)" stroke="rgba(186,230,253,0.35)" />
  <text x="72" y="520" fill="#e2e8f0" font-size="60" font-weight="700" font-family="Inter,system-ui,sans-serif">${title}</text>
  <text x="72" y="575" fill="#bfdbfe" font-size="30" font-family="Inter,system-ui,sans-serif">${escapeXml(subtitle)}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function resolveDrillThumbnail(drill: PortableDrill, assets: PortableAssetRef[] = []): ResolvedDrillThumbnail {
  const assetsById = toAssetMap(assets);
  const uploaded = drill.thumbnailAssetId ? assetsById[drill.thumbnailAssetId] : undefined;
  if (uploaded && isRenderableUri(uploaded.uri)) {
    return { src: uploaded.uri, source: "uploaded" };
  }

  const generatedAsset = drill.previewAssetId ? assetsById[drill.previewAssetId] : undefined;
  if (generatedAsset && isRenderableUri(generatedAsset.uri)) {
    return { src: generatedAsset.uri, source: "generated" };
  }

  return { src: buildGeneratedThumbnailDataUri(drill), source: "fallback" };
}
