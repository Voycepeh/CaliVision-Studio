import type { DrillPackage } from "@/lib/schema/contracts";

export function serializePackageForExport(drillPackage: DrillPackage): string {
  return `${JSON.stringify(drillPackage, null, 2)}\n`;
}

export function createPackageExportFileName(drillPackage: DrillPackage): string {
  const manifest = drillPackage.manifest;
  const safePackageId = manifest.packageId.replace(/[^a-zA-Z0-9-_]/g, "_");
  const safeVersion = manifest.packageVersion.replace(/[^a-zA-Z0-9.-_]/g, "_");
  return `${safePackageId}_v${safeVersion}.json`;
}

export function downloadPackageJson(drillPackage: DrillPackage): void {
  const json = serializePackageForExport(drillPackage);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = createPackageExportFileName(drillPackage);
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
}
