import type { DrillPackage } from "@/lib/schema/contracts";

export type PublishTarget = "local-mock" | "future-hosted";

export type PackageLocator = {
  scheme: "mock" | "storage";
  key: string;
  uri: string;
};

export type PublishArtifact = {
  packageId: string;
  packageVersion: string;
  checksumSha256: string;
  generatedAtIso: string;
  byteSize: number;
  packageJson: string;
  package: DrillPackage;
};

export type PublishRequest = {
  target: PublishTarget;
  artifact: PublishArtifact;
  metadata: {
    title: string;
    summary: string;
    description?: string;
    authorDisplayName?: string;
    tags: string[];
    categories: string[];
    visibility: "private" | "unlisted" | "public";
    packageSlug?: string;
    versionId?: string;
    lineageId?: string;
    provenanceSummary?: string;
  };
};

export type PublishResult = {
  target: PublishTarget;
  locator: PackageLocator;
  publishedAtIso: string;
  recordId: string;
  metadata: PublishRequest["metadata"];
  artifactChecksumSha256: string;
};

export type StorageWriteInput = {
  artifact: PublishArtifact;
};

export interface StorageProvider {
  readonly name: string;
  putArtifact(input: StorageWriteInput): Promise<PackageLocator>;
}

export type RegistryPublishInput = {
  target: PublishTarget;
  locator: PackageLocator;
  artifact: PublishArtifact;
  metadata: PublishRequest["metadata"];
};

export interface PackageRegistryAdapter {
  readonly name: string;
  publish(input: RegistryPublishInput): Promise<PublishResult>;
  listRecent(): Promise<PublishResult[]>;
}
