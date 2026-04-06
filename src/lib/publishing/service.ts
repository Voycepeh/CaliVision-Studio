import type {
  PackageRegistryAdapter,
  PublishRequest,
  PublishResult,
  StorageProvider
} from "@/lib/publishing/types";

export class PackagePublishService {
  constructor(
    private readonly storageProvider: StorageProvider,
    private readonly registryAdapter: PackageRegistryAdapter
  ) {}

  async publish(request: PublishRequest): Promise<PublishResult> {
    const locator = await this.storageProvider.putArtifact({ artifact: request.artifact });

    return this.registryAdapter.publish({
      target: request.target,
      locator,
      artifact: request.artifact,
      metadata: request.metadata
    });
  }

  async listRecentPublishes(): Promise<PublishResult[]> {
    return this.registryAdapter.listRecent();
  }
}
