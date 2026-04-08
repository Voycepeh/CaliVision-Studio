import type { DrillPackage } from "../schema/contracts.ts";

export type DrillDisplayMetadata = {
  title: string;
  phaseCount: number;
};

export function getPrimaryDrillDisplayMetadata(packageJson: DrillPackage): DrillDisplayMetadata {
  const primaryDrill = packageJson.drills[0];
  return {
    title: primaryDrill?.title ?? packageJson.manifest.packageId,
    phaseCount: primaryDrill?.phases.length ?? 0
  };
}
