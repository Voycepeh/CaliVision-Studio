import type {
  DrillBundleAssetFile,
  DrillBundleFile,
  DrillBundleManifest,
  DrillPackage,
  PortableAssetRef,
  PortableAssetRole
} from "@/lib/schema/contracts";
import { normalizePortableDrillPackage } from "@/lib/package/validation/validate-package";

const PACKAGE_URI_PREFIX = "package://";

export type ExportWarning = {
  assetId: string;
  message: string;
};

export type ExportBundleResult = {
  bundle: DrillBundleFile;
  warnings: ExportWarning[];
};

export function serializePackageForExport(drillPackage: DrillPackage): string {
  const normalized = normalizePortableDrillPackage(drillPackage);
  return `${JSON.stringify(normalized, null, 2)}\n`;
}

export function serializeBundleForExport(bundle: DrillBundleFile): string {
  return `${JSON.stringify(bundle, null, 2)}\n`;
}

export function createPackageExportFileName(drillPackage: DrillPackage, format: "json" | "bundle" = "bundle"): string {
  const manifest = drillPackage.manifest;
  const safePackageId = manifest.packageId.replace(/[^a-zA-Z0-9-_]/g, "_");
  const safeVersion = manifest.packageVersion.replace(/[^a-zA-Z0-9.-_]/g, "_");

  if (format === "json") {
    return `${safePackageId}_v${safeVersion}.json`;
  }

  return `${safePackageId}_v${safeVersion}.cvpkg.json`;
}

export async function buildBundleForExport(
  drillPackage: DrillPackage,
  packageAssetBlobsById: Record<string, Blob>
): Promise<ExportBundleResult> {
  const warnings: ExportWarning[] = [];
  const files: DrillBundleAssetFile[] = [];
  const normalizedPackage = normalizePortableDrillPackage(drillPackage);

  for (const asset of normalizedPackage.assets) {
    const bundlePath = toBundleRelativePath(asset);
    if (!bundlePath) {
      continue;
    }

    const blob = packageAssetBlobsById[asset.assetId];
    if (!blob) {
      warnings.push({
        assetId: asset.assetId,
        message: `Asset '${asset.assetId}' is referenced but local binary data was unavailable for export.`
      });
      continue;
    }

    const buffer = await blob.arrayBuffer();

    files.push({
      path: bundlePath,
      mimeType: asset.mimeType ?? blob.type ?? "application/octet-stream",
      byteSize: blob.size,
      base64Data: arrayBufferToBase64(buffer)
    });
  }

  const bundleManifest: DrillBundleManifest = {
    bundleVersion: "1",
    packageId: normalizedPackage.manifest.packageId,
    packageVersion: normalizedPackage.manifest.packageVersion,
    createdAtIso: new Date().toISOString(),
    drillPath: "drill.json",
    assets: files.map((file) => {
      const ref = normalizedPackage.assets.find((asset) => toBundleRelativePath(asset) === file.path);
      return {
        assetId: ref?.assetId ?? file.path,
        role: (ref?.role ?? "phase-source-image") as PortableAssetRole,
        type: ref?.type ?? "image",
        ownerDrillId: ref?.ownerDrillId,
        ownerPhaseId: ref?.ownerPhaseId,
        path: file.path,
        mimeType: file.mimeType,
        byteSize: file.byteSize
      };
    })
  };

  return {
    bundle: {
      manifest: bundleManifest,
      drill: normalizedPackage,
      files
    },
    warnings
  };
}

export function downloadPackageJson(drillPackage: DrillPackage): void {
  const json = serializePackageForExport(drillPackage);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = createPackageExportFileName(drillPackage, "json");
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
}

export function downloadPackageBundle(bundle: DrillBundleFile, drillPackage: DrillPackage): void {
  const json = serializeBundleForExport(bundle);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = createPackageExportFileName(drillPackage, "bundle");
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
}

function toBundleRelativePath(asset: PortableAssetRef): string | null {
  if (!asset.uri.startsWith(PACKAGE_URI_PREFIX)) {
    return null;
  }

  return asset.uri.slice(PACKAGE_URI_PREFIX.length);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary);
}
