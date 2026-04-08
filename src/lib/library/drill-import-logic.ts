import type { DrillPackage } from "../schema/contracts.ts";

export type DrillImportDecision = {
  status: "imported" | "duplicate";
  workspace: "browser" | "cloud";
  drillId: string;
  title: string;
  matchedOtherWorkspace: boolean;
};

export function buildPackageIdentityKeys(pkgInput: DrillPackage): string[] {
  const lineageId = pkgInput.manifest.versioning?.lineageId ?? pkgInput.manifest.packageId;
  const versionId = pkgInput.manifest.versioning?.versionId ?? pkgInput.manifest.packageVersion;
  const packageId = pkgInput.manifest.packageId;
  const packageVersion = pkgInput.manifest.packageVersion;

  return [`lineage:${lineageId}:version:${versionId}`, `package:${packageId}:version:${packageVersion}`];
}

export function hasDuplicatePackageIdentity(input: DrillPackage, existingPackages: DrillPackage[]): boolean {
  const incomingKeys = new Set(buildPackageIdentityKeys(input));
  return existingPackages.some((pkg) => buildPackageIdentityKeys(pkg).some((key) => incomingKeys.has(key)));
}

export function decideDrillImportOutcome(input: {
  packageJson: DrillPackage;
  workspace: "browser" | "cloud";
  targetWorkspacePackages: DrillPackage[];
  otherWorkspacePackages?: DrillPackage[];
}): DrillImportDecision {
  const title = input.packageJson.drills[0]?.title ?? input.packageJson.manifest.packageId;
  const duplicate = hasDuplicatePackageIdentity(input.packageJson, input.targetWorkspacePackages);
  const matchedOtherWorkspace = input.workspace === "cloud" && hasDuplicatePackageIdentity(input.packageJson, input.otherWorkspacePackages ?? []);

  return {
    status: duplicate ? "duplicate" : "imported",
    workspace: input.workspace,
    drillId: input.packageJson.manifest.packageId,
    title,
    matchedOtherWorkspace
  };
}
