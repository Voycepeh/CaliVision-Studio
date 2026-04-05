import { mapPackageToStudioViewModel, type StudioPackageViewModel } from "@/lib/package/mapping/view-models";
import {
  parsePackageJson,
  toValidatedPackage,
  validatePortableDrillPackage,
  type PackageValidationResult
} from "@/lib/package/validation/validate-package";
import type { DrillPackage } from "@/lib/schema/contracts";

export type LoadPackageSuccess = {
  ok: true;
  packageViewModel: StudioPackageViewModel;
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
  const safeStem = file.name.replace(/\.json$/i, "").replace(/[^a-zA-Z0-9-_]/g, "_");
  return `import-${safeStem}-${Date.now()}`;
}

export function packageKeyFromSample(packagePayload: DrillPackage): string {
  return `sample-${packagePayload.manifest.packageId}`;
}
