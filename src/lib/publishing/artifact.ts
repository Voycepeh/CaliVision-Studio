import { clonePackage, getPrimaryDrill } from "@/lib/editor/package-editor";
import { serializePackageForExport } from "@/lib/package/export/export-package";
import type { DrillPackage } from "@/lib/schema/contracts";
import type { PublishArtifact } from "@/lib/publishing/types";

function removeTemporaryPhaseAssetRefs(drillPackage: DrillPackage): void {
  drillPackage.drills.forEach((drill) => {
    drill.phases.forEach((phase) => {
      phase.assetRefs = phase.assetRefs.filter((asset) => !asset.uri.startsWith("local://phase-images/"));
    });
  });
}

async function computeSha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createPublishArtifact(sourcePackage: DrillPackage): Promise<PublishArtifact> {
  const nextPackage = clonePackage(sourcePackage);
  const nowIso = new Date().toISOString();
  nextPackage.manifest.updatedAtIso = nowIso;

  const drill = getPrimaryDrill(nextPackage);
  if (drill) {
    nextPackage.manifest.publishing = {
      ...nextPackage.manifest.publishing,
      title: nextPackage.manifest.publishing?.title ?? drill.title,
      description: nextPackage.manifest.publishing?.description ?? drill.description,
      tags: nextPackage.manifest.publishing?.tags?.length ? nextPackage.manifest.publishing.tags : drill.tags,
      publishStatus: "draft"
    };
  }

  removeTemporaryPhaseAssetRefs(nextPackage);

  const packageJson = serializePackageForExport(nextPackage);
  const checksumSha256 = await computeSha256Hex(packageJson);
  const byteSize = new TextEncoder().encode(packageJson).byteLength;
  const serializedPackage = JSON.parse(packageJson) as DrillPackage;

  return {
    packageId: serializedPackage.manifest.packageId,
    packageVersion: serializedPackage.manifest.packageVersion,
    checksumSha256,
    generatedAtIso: nowIso,
    byteSize,
    packageJson,
    package: serializedPackage
  };
}
