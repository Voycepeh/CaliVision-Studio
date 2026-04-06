import type { PackageSourceType } from "./types.ts";

export function createArtifactId(packageId: string, packageVersion: string): string {
  return `${packageId}@${packageVersion}`;
}

export function createEntryId(input: {
  packageId: string;
  packageVersion: string;
  sourceType: PackageSourceType;
  sourceLabel: string;
  parentEntryId?: string;
}): string {
  const artifactId = createArtifactId(input.packageId, input.packageVersion);
  const provenanceToken = input.parentEntryId?.trim()
    ? `parent:${input.parentEntryId.trim().toLocaleLowerCase()}`
    : `source:${input.sourceLabel.trim().toLocaleLowerCase()}`;

  return `${artifactId}#${input.sourceType}:${toStableKeyFragment(provenanceToken)}`;
}

export function toStableKeyFragment(value: string): string {
  return value
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLocaleLowerCase();
}


export function upgradeLegacyEntryId(input: {
  entryId: string;
  packageId: string;
  packageVersion: string;
  sourceType: PackageSourceType;
  sourceLabel: string;
  parentEntryId?: string;
}): string {
  if (input.entryId.includes("#")) {
    return input.entryId;
  }

  return createEntryId({
    packageId: input.packageId,
    packageVersion: input.packageVersion,
    sourceType: input.sourceType,
    sourceLabel: input.sourceLabel,
    parentEntryId: input.parentEntryId
  });
}
