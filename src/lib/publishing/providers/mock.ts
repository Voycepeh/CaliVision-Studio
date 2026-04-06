import type {
  PackageLocator,
  PackageRegistryAdapter,
  PublishArtifact,
  PublishRequest,
  PublishResult,
  RegistryPublishInput,
  StorageProvider,
  StorageWriteInput
} from "@/lib/publishing/types";

function buildMockKey(artifact: PublishArtifact): string {
  return `${artifact.packageId}/${artifact.packageVersion}/${artifact.checksumSha256.slice(0, 12)}`;
}

export class MockStorageProvider implements StorageProvider {
  readonly name = "mock-storage";

  async putArtifact(input: StorageWriteInput): Promise<PackageLocator> {
    const key = buildMockKey(input.artifact);
    return {
      scheme: "mock",
      key,
      uri: `mock://packages/${key}`
    };
  }
}

export class MockPackageRegistryAdapter implements PackageRegistryAdapter {
  readonly name = "mock-registry";

  private readonly entries: PublishResult[] = [];

  async publish(input: RegistryPublishInput): Promise<PublishResult> {
    const recordId = `mock-pub-${this.entries.length + 1}`;
    const result: PublishResult = {
      target: input.target,
      locator: input.locator,
      publishedAtIso: new Date().toISOString(),
      recordId,
      metadata: input.metadata,
      artifactChecksumSha256: input.artifact.checksumSha256
    };

    this.entries.unshift(result);
    return result;
  }

  async listRecent(): Promise<PublishResult[]> {
    return this.entries;
  }
}

export function createMockPublishRequestMetadata(artifact: PublishArtifact): PublishRequest["metadata"] {
  const manifestPublishing = artifact.package.manifest.publishing;
  const drill = artifact.package.drills[0];

  return {
    title: manifestPublishing?.title ?? drill?.title ?? artifact.packageId,
    summary: manifestPublishing?.summary ?? drill?.description ?? "",
    description: manifestPublishing?.description ?? drill?.description,
    authorDisplayName: manifestPublishing?.authorDisplayName,
    tags: manifestPublishing?.tags ?? drill?.tags ?? [],
    categories: manifestPublishing?.categories ?? [],
    visibility: manifestPublishing?.visibility ?? "private"
  };
}
