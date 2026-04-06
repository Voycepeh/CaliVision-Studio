import { mapPackageToStudioViewModel, type StudioPackageViewModel } from "@/lib/package/mapping/view-models";
import {
  parsePackageJson,
  toValidatedPackage,
  validatePortableDrillPackage,
  type PackageValidationResult
} from "@/lib/package/validation/validate-package";
import type { DrillBundleFile, DrillPackage } from "@/lib/schema/contracts";

export type ImportedBundleAsset = {
  assetId: string;
  path: string;
  blob: Blob;
};

export type ImportedBundle = {
  bundleManifestVersion: string;
  assetsById: Record<string, ImportedBundleAsset>;
};

export type LoadPackageSuccess = {
  ok: true;
  packageViewModel: StudioPackageViewModel;
  importedBundle?: ImportedBundle;
};

export type LoadPackageFailure = {
  ok: false;
  error: string;
  validation?: PackageValidationResult;
};

export type LoadPackageResult = LoadPackageSuccess | LoadPackageFailure;

export function loadPackageFromUnknown(input: unknown, packageKey: string, sourceLabel: string): LoadPackageResult {
  const validated = toValidatedPackage(input);

  if (!validated.ok) {
    return {
      ok: false,
      error: "Package failed validation.",
      validation: validated.validation
    };
  }

  return {
    ok: true,
    packageViewModel: mapPackageToStudioViewModel(packageKey, validated.value, validated.validation, sourceLabel)
  };
}

export function loadPackageFromJsonText(rawText: string, packageKey: string, sourceLabel: string): LoadPackageResult {
  const parsed = parsePackageJson(rawText);

  if (!parsed.ok) {
    return {
      ok: false,
      error: `Invalid JSON: ${parsed.error}`
    };
  }

  if (isBundleFile(parsed.parsed)) {
    return loadPackageFromBundle(parsed.parsed, packageKey, sourceLabel);
  }

  return loadPackageFromUnknown(parsed.parsed, packageKey, sourceLabel);
}

export function validateImportedPackage(input: unknown): PackageValidationResult {
  return validatePortableDrillPackage(input);
}

export async function readPackageFile(file: File, packageKey: string): Promise<LoadPackageResult> {
  const rawText = await file.text();
  return loadPackageFromJsonText(rawText, packageKey, `local-file:${file.name}`);
}

export function packageKeyFromFile(file: File): string {
  const safeStem = file.name.replace(/\.(json|cvpkg\.json)$/i, "").replace(/[^a-zA-Z0-9-_]/g, "_");
  return `import-${safeStem}-${Date.now()}`;
}

export function packageKeyFromSample(packagePayload: DrillPackage): string {
  return `sample-${packagePayload.manifest.packageId}`;
}

function loadPackageFromBundle(bundle: DrillBundleFile, packageKey: string, sourceLabel: string): LoadPackageResult {
  const loaded = loadPackageFromUnknown(bundle.drill, packageKey, sourceLabel);

  if (!loaded.ok) {
    return loaded;
  }

  const assetsByPath = new Map(bundle.files.map((file) => [file.path, file]));
  const assetsById: Record<string, ImportedBundleAsset> = {};

  for (const asset of bundle.manifest.assets) {
    const bundleFile = assetsByPath.get(asset.path);

    if (!bundleFile) {
      return {
        ok: false,
        error: `Bundle is missing binary file for asset '${asset.assetId}' at path '${asset.path}'.`
      };
    }

    try {
      assetsById[asset.assetId] = {
        assetId: asset.assetId,
        path: asset.path,
        blob: new Blob([base64ToUint8Array(bundleFile.base64Data)], {
          type: bundleFile.mimeType || asset.mimeType || "application/octet-stream"
        })
      };
    } catch {
      return {
        ok: false,
        error: `Bundle contains malformed base64 binary for asset '${asset.assetId}'.`
      };
    }
  }

  return {
    ...loaded,
    importedBundle: {
      bundleManifestVersion: bundle.manifest.bundleVersion,
      assetsById
    }
  };
}

function isBundleFile(input: unknown): input is DrillBundleFile {
  if (!input || typeof input !== "object") {
    return false;
  }

  const candidate = input as Record<string, unknown>;
  return Boolean(candidate.manifest && candidate.drill && Array.isArray(candidate.files));
}

function base64ToUint8Array(base64Data: string): Uint8Array {
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
