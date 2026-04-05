export type PortableAssetRef = {
  id: string;
  type: "video" | "audio" | "image" | "overlay";
  uri: string;
  checksum?: string;
  meta?: Record<string, string | number | boolean>;
};

export type PortablePose = {
  timestampMs: number;
  joints: Record<string, { x: number; y: number; z?: number; confidence?: number }>;
  coordinateSpace: "normalized" | "pixel";
};

export type PortablePhase = {
  id: string;
  title: string;
  notes?: string;
  durationMs: number;
  targetTempoBpm?: number;
  poses: PortablePose[];
  assetRefs?: PortableAssetRef[];
};

export type PortableDrill = {
  id: string;
  slug: string;
  title: string;
  description?: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  tags: string[];
  phases: PortablePhase[];
};

export type DrillManifest = {
  schemaVersion: string;
  packageId: string;
  packageVersion: string;
  createdAtIso: string;
  source: "web-studio";
  compatibleConsumers: Array<"android-app" | "web-player">;
};

export type DrillPackage = {
  manifest: DrillManifest;
  drill: PortableDrill;
  assets: PortableAssetRef[];
};
