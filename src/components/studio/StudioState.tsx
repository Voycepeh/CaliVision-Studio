"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { upsertHostedLibraryItem } from "@/lib/hosted/library-repository";
import {
  clonePackage,
  createEditablePackageEntry,
  createNewPhase,
  createStablePhaseId,
  getPrimaryDrill,
  getSortedPhases,
  normalizePhaseOrder,
  setJointCoordinate,
  updateWorkingPackage,
  type EditablePackageEntry
} from "@/lib/editor/package-editor";
import {
  buildBundleForExport,
  createDerivedPackage,
  ensureVersioningMetadata,
  downloadPackageBundle,
  loadPackageFromUnknown,
  packageKeyFromFile,
  readPackageFile,
  SAMPLE_PACKAGE_DEFINITIONS,
  validatePortableDrillPackage,
  type PackageValidationIssue
} from "@/lib/package";
import {
  createMockPublishRequestMetadata,
  createPublishArtifact,
  MockPackageRegistryAdapter,
  MockStorageProvider,
  PackagePublishService,
  validatePackagePublishReadiness,
  type PublishReadinessResult,
  type PublishResult
} from "@/lib/publishing";
import { loadLocalRegistryEntries, upsertRegistryEntryFromPackage } from "@/lib/registry";
import {
  getLastOpenedDraft,
  loadDraft,
  loadDraftList,
  saveDraft,
  setLastOpenedDraft
} from "@/lib/persistence/local-draft-store";
import { loadEditableVersionForDrill, loadVersionById, markVersionReady, validateVersionReadiness } from "@/lib/library";
import { detectPoseFromImage, mapDetectionResultToPortablePose, type DetectionResult } from "@/lib/detection";
import { buildPhaseIndexMap, chooseFallbackPhaseId, type PreviousPhaseIndexMap } from "@/components/studio/studio-selection";
import type {
  CanonicalJointName,
  DrillPackagePublishingMetadata,
  PortableAssetRef,
  PortableDrill,
  PortablePhase,
  PortableViewType,
  SchemaVersion
} from "@/lib/schema/contracts";

export type ImportFeedback = {
  status: "idle" | "success" | "warning" | "error";
  message: string;
  issues: PackageValidationIssue[];
};

export type PhaseSourceImageOrigin = "local-editor" | "bundled-package";

export type PhaseSourceImage = {
  assetId: string;
  objectUrl: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  updatedAtIso: string;
  origin: PhaseSourceImageOrigin;
  portableUri: string;
};

export type DetectionWorkflowState = {
  status: "idle" | "uploaded" | "detecting" | "detected" | "failed" | "applied";
  result: DetectionResult | null;
  message: string;
};

export type OverlayFitMode = "contain" | "cover";

export type PhaseOverlayState = {
  showImage: boolean;
  showPose: boolean;
  imageOpacity: number;
  fitMode: OverlayFitMode;
  offsetX: number;
  offsetY: number;
};

export type PublishWorkflowState = {
  panelOpen: boolean;
  status: "idle" | "validating" | "ready" | "publishing" | "published" | "blocked";
  readiness: PublishReadinessResult | null;
  lastArtifactChecksumSha256: string | null;
  lastResult: PublishResult | null;
  recentPublishes: PublishResult[];
  message: string;
};

export type LocalSaveState = "idle" | "saving" | "saved" | "error";
export type HostedSaveState = "idle" | "saving" | "saved" | "error";

type StudioStateValue = {
  packages: EditablePackageEntry[];
  selectedPackageKey: string | null;
  selectedPhaseId: string | null;
  selectedJointName: CanonicalJointName | null;
  importFeedback: ImportFeedback;
  saveStatusLabel: string;
  localSaveState: LocalSaveState;
  hostedSaveState: HostedSaveState;
  hostedSaveStatusMessage: string;
  draftVersionLabel: string;
  selectedPackage: EditablePackageEntry | null;
  selectedPhaseSourceImage: PhaseSourceImage | null;
  selectedPhaseDetection: DetectionWorkflowState;
  selectedPhaseOverlayState: PhaseOverlayState;
  selectPackage: (packageKey: string) => void;
  selectPhase: (phaseId: string | null) => void;
  selectJoint: (jointName: CanonicalJointName | null) => void;
  loadSampleById: (sampleId: string) => void;
  importFromFile: (file: File) => Promise<void>;
  exportSelectedPackage: () => void;
  renamePhase: (phaseId: string, title: string) => void;
  setPhaseDuration: (phaseId: string, durationMs: number) => void;
  setPhaseSummary: (phaseId: string, summary: string) => void;
  setPhaseView: (phaseId: string, view: PortableViewType) => void;
  setDrillTitle: (title: string) => void;
  setDrillSlug: (slug: string) => void;
  setDrillDescription: (description: string) => void;
  setDrillType: (drillType: PortableDrill["drillType"]) => void;
  setDrillDifficulty: (difficulty: "beginner" | "intermediate" | "advanced") => void;
  setDrillDefaultView: (view: PortableViewType) => void;
  setManifestSchemaVersion: (schemaVersion: SchemaVersion) => void;
  setManifestPackageVersion: (packageVersion: string) => void;
  addPhase: () => void;
  deletePhase: (phaseId: string) => void;
  duplicatePhase: (phaseId: string) => void;
  movePhase: (phaseId: string, direction: "up" | "down") => void;
  setJointCoordinates: (phaseId: string, joint: CanonicalJointName, x: number, y: number) => void;
  nudgeJoint: (phaseId: string, joint: CanonicalJointName, dx: number, dy: number) => void;
  revertSelectedJoint: (phaseId: string, joint: CanonicalJointName) => void;
  setSelectedPhaseImage: (file: File) => Promise<void>;
  clearSelectedPhaseImage: () => void;
  runPoseDetectionForSelectedPhase: () => Promise<void>;
  applyDetectionToSelectedPhase: () => void;
  setSelectedPhaseOverlayState: (partial: Partial<PhaseOverlayState>) => void;
  resetSelectedPhaseOverlayState: () => void;
  openPublishPanel: () => void;
  closePublishPanel: () => void;
  runPublishReadinessCheck: () => Promise<void>;
  runMockPublish: () => Promise<void>;
  publishWorkflow: PublishWorkflowState;
  updatePublishingMetadata: (partial: Partial<DrillPackagePublishingMetadata>) => void;
  duplicateSelectedPackage: () => void;
  forkSelectedPackage: () => void;
  createSelectedPackageNewVersion: () => void;
  saveSelectedToHosted: () => Promise<void>;
  markSelectedVersionReady: () => Promise<void>;
  persistenceMode: "local" | "cloud";
};

const StudioStateContext = createContext<StudioStateValue | undefined>(undefined);

const DEFAULT_DETECTION_WORKFLOW_STATE: DetectionWorkflowState = {
  status: "idle",
  result: null,
  message: "Upload a phase image to begin detection."
};

const DEFAULT_PHASE_OVERLAY_STATE: PhaseOverlayState = {
  showImage: true,
  showPose: true,
  imageOpacity: 0.66,
  fitMode: "contain",
  offsetX: 0,
  offsetY: 0
};

const DEFAULT_PUBLISH_WORKFLOW_STATE: PublishWorkflowState = {
  panelOpen: false,
  status: "idle",
  readiness: null,
  lastArtifactChecksumSha256: null,
  lastResult: null,
  recentPublishes: [],
  message: "Run publish readiness checks to prepare a mock publish."
};

function createInitialPackages(): EditablePackageEntry[] {
  const registryEntries = loadLocalRegistryEntries();

  if (registryEntries.length > 0) {
    return registryEntries.flatMap((entry) => {
      const result = loadPackageFromUnknown(entry.details.packageJson, `registry-${entry.entryId}`, entry.details.origin.sourceLabel);

      if (!result.ok) {
        return [];
      }

      return [
        createEditablePackageEntry(
          result.packageViewModel.packageKey,
          entry.details.origin.sourceLabel,
          result.packageViewModel.package
        )
      ];
    });
  }

  return [];
}

function getPhaseScopeKey(packageKey: string | null, phaseId: string | null): string | null {
  if (!packageKey || !phaseId) {
    return null;
  }

  return `${packageKey}:${phaseId}`;
}

function toDraftIdFromPackage(entry: EditablePackageEntry): string {
  const manifest = entry.workingPackage.manifest;
  return manifest.versioning?.versionId ?? `${manifest.packageId}@${manifest.packageVersion}`;
}

function draftIdFromPackageKey(packageKey: string): string | null {
  return packageKey.startsWith("draft:") ? packageKey.slice("draft:".length) : null;
}

function normalizeFileStem(raw: string): string {
  return raw
    .toLocaleLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "asset";
}

function extensionFromMimeType(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return "jpg";
}

function toPhaseAssetRef(phaseId: string, image: PhaseSourceImage): PortableAssetRef {
  return {
    assetId: image.assetId,
    type: "image",
    role: "phase-source-image",
    ownerPhaseId: phaseId,
    uri: image.portableUri,
    mimeType: image.mimeType,
    byteSize: image.byteSize
  };
}

function toPhaseAssetIdentity(phaseId: string, imageName: string, mimeType: string): { assetId: string; portableUri: string } {
  const stem = normalizeFileStem(imageName);
  const extension = extensionFromMimeType(mimeType);
  const assetId = `phase-image-${phaseId}`;
  const fileName = `${phaseId}-${stem}.${extension}`;
  return {
    assetId,
    portableUri: `package://assets/phase-images/${fileName}`
  };
}

function removeTemporaryPhaseAssetRef(phase: PortablePhase): void {
  phase.assetRefs = phase.assetRefs.filter((asset) => !(asset.role === "phase-source-image" || asset.uri.startsWith("local://phase-images/")));
}

function loadImageFromObjectUrl(objectUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image for pose detection."));
    image.src = objectUrl;
  });
}

async function toPhaseSourceImageFromBlob(
  assetId: string,
  portableUri: string,
  fileName: string,
  blob: Blob,
  origin: PhaseSourceImageOrigin
): Promise<PhaseSourceImage> {
  const objectUrl = URL.createObjectURL(blob);
  const image = await loadImageFromObjectUrl(objectUrl);

  return {
    assetId,
    portableUri,
    objectUrl,
    fileName,
    mimeType: blob.type || "application/octet-stream",
    byteSize: blob.size,
    width: image.naturalWidth,
    height: image.naturalHeight,
    updatedAtIso: new Date().toISOString(),
    origin
  };
}

export function StudioStateProvider({
  children,
  initialPackageId,
  initialDraftId,
  initialDrillId,
  initialVersionId,
  initialHostedDraftId
}: {
  children: React.ReactNode;
  initialPackageId?: string;
  initialDraftId?: string;
  initialDrillId?: string;
  initialVersionId?: string;
  initialHostedDraftId?: string;
}) {
  const [packages, setPackages] = useState<EditablePackageEntry[]>(() => createInitialPackages());
  const [selectedPackageKey, setSelectedPackageKey] = useState<string | null>(() => createInitialPackages()[0]?.packageKey ?? null);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(() => {
    const first = createInitialPackages()[0];
    const firstPhase = first ? getSortedPhases(first.workingPackage)[0] : null;
    return firstPhase?.phaseId ?? null;
  });
  const [selectedJointName, setSelectedJointName] = useState<CanonicalJointName | null>(null);
  const [importFeedback, setImportFeedback] = useState<ImportFeedback>({ status: "idle", message: "", issues: [] });
  const [phaseSourceImages, setPhaseSourceImages] = useState<Record<string, PhaseSourceImage>>({});
  const [packageAssetBlobs, setPackageAssetBlobs] = useState<Record<string, Record<string, Blob>>>({});
  const [phaseDetectionState, setPhaseDetectionState] = useState<Record<string, DetectionWorkflowState>>({});
  const [phaseOverlayState, setPhaseOverlayState] = useState<Record<string, PhaseOverlayState>>({});
  const [publishWorkflow, setPublishWorkflow] = useState<PublishWorkflowState>(DEFAULT_PUBLISH_WORKFLOW_STATE);
  const [localSaveState, setLocalSaveState] = useState<LocalSaveState>("idle");
  const [hostedSaveState, setHostedSaveState] = useState<HostedSaveState>("idle");
  const [hostedSaveStatusMessage, setHostedSaveStatusMessage] = useState("Cloud save is available when signed in.");
  const [, setHostedVersionIdsByPackageKey] = useState<Record<string, string>>({});
  const { session, isConfigured, persistenceMode } = useAuth();
  const router = useRouter();
  const [draftIdsByPackageKey, setDraftIdsByPackageKey] = useState<Record<string, string>>({});
  const [hydrationComplete, setHydrationComplete] = useState(false);
  const hasLoadedDraftsRef = useRef(false);
  const packagesRef = useRef(packages);
  const draftIdsByPackageKeyRef = useRef(draftIdsByPackageKey);
  const packageAssetBlobsRef = useRef(packageAssetBlobs);
  const [publishService] = useState(
    () => new PackagePublishService(new MockStorageProvider(), new MockPackageRegistryAdapter())
  );
  const initializedDeepLinkPackageIdRef = useRef<string | null>(null);
  const initializedLocalDrillIdRef = useRef<string | null>(null);
  const previousPhaseIndexesRef = useRef<PreviousPhaseIndexMap>({});

  const selectedPackage = useMemo(() => packages.find((item) => item.packageKey === selectedPackageKey) ?? null, [packages, selectedPackageKey]);

  useEffect(() => {
    packagesRef.current = packages;
  }, [packages]);

  useEffect(() => {
    draftIdsByPackageKeyRef.current = draftIdsByPackageKey;
  }, [draftIdsByPackageKey]);

  useEffect(() => {
    packageAssetBlobsRef.current = packageAssetBlobs;
  }, [packageAssetBlobs]);

  const selectedScopeKey = getPhaseScopeKey(selectedPackageKey, selectedPhaseId);
  const selectedPhaseSourceImage = selectedScopeKey ? phaseSourceImages[selectedScopeKey] ?? null : null;
  const selectedPhaseDetection = selectedScopeKey ? phaseDetectionState[selectedScopeKey] ?? DEFAULT_DETECTION_WORKFLOW_STATE : DEFAULT_DETECTION_WORKFLOW_STATE;
  const selectedPhaseOverlayState = selectedScopeKey ? phaseOverlayState[selectedScopeKey] ?? DEFAULT_PHASE_OVERLAY_STATE : DEFAULT_PHASE_OVERLAY_STATE;

  useEffect(() => {
    if (persistenceMode !== "local") {
      setHydrationComplete(true);
      return;
    }

    if (hasLoadedDraftsRef.current) {
      return;
    }

    hasLoadedDraftsRef.current = true;

    void (async () => {
      try {
        const summaries = await loadDraftList();
        if (summaries.length === 0) {
          setHydrationComplete(true);
          return;
        }

        const nextEntries: EditablePackageEntry[] = [];
        const nextPackageAssetBlobs: Record<string, Record<string, Blob>> = {};
        const nextDraftIds: Record<string, string> = {};
        const draftToPackageKey: Record<string, string> = {};

        for (const summary of summaries) {
          const loaded = await loadDraft(summary.draftId);
          if (!loaded) {
            continue;
          }

          const packageKey = `draft:${summary.draftId}`;
          nextDraftIds[packageKey] = summary.draftId;
          draftToPackageKey[summary.draftId] = packageKey;
          nextEntries.push(createEditablePackageEntry(packageKey, summary.sourceLabel, loaded.record.packageJson));
          nextPackageAssetBlobs[packageKey] = loaded.assetsById;
        }

        if (nextEntries.length === 0) {
          setHydrationComplete(true);
          return;
        }

        const nextPhaseSourceImages: Record<string, PhaseSourceImage> = {};
        for (const entry of nextEntries) {
          const blobs = nextPackageAssetBlobs[entry.packageKey] ?? {};
          const drill = getPrimaryDrill(entry.workingPackage);
          for (const phase of drill?.phases ?? []) {
            const phaseImageAsset = phase.assetRefs.find((asset) => asset.role === "phase-source-image");
            if (!phaseImageAsset) {
              continue;
            }

            const blob = blobs[phaseImageAsset.assetId];
            if (!blob) {
              continue;
            }

            try {
              const sourceImage = await toPhaseSourceImageFromBlob(
                phaseImageAsset.assetId,
                phaseImageAsset.uri,
                `${phaseImageAsset.assetId}.img`,
                blob,
                "local-editor"
              );
              nextPhaseSourceImages[`${entry.packageKey}:${phase.phaseId}`] = sourceImage;
            } catch {
              // Skip unreadable assets; package data remains editable.
            }
          }
        }

        const lastOpenedDraftId = initialDraftId ?? (await getLastOpenedDraft());
        const preferredPackageKey = lastOpenedDraftId ? draftToPackageKey[lastOpenedDraftId] : nextEntries[0]?.packageKey ?? null;
        const preferredEntry = nextEntries.find((entry) => entry.packageKey === preferredPackageKey) ?? nextEntries[0] ?? null;

        setPackages(nextEntries);
        setDraftIdsByPackageKey(nextDraftIds);
        setPackageAssetBlobs(nextPackageAssetBlobs);
        setPhaseSourceImages(nextPhaseSourceImages);
        setSelectedPackageKey(preferredEntry?.packageKey ?? null);
        setSelectedPhaseId(preferredEntry ? getSortedPhases(preferredEntry.workingPackage)[0]?.phaseId ?? null : null);
      } catch {
        setLocalSaveState("error");
      } finally {
        setHydrationComplete(true);
      }
    })();
  }, [initialDraftId, persistenceMode]);

  useEffect(() => {
    if (persistenceMode !== "cloud" || !session || !isConfigured) {
      return;
    }

    const requestedVersionId = initialVersionId ?? initialDraftId ?? initialHostedDraftId;
    const requestedDrillId = initialDrillId;
    if (!requestedVersionId && !requestedDrillId) {
      return;
    }

    void (async () => {
      const context = { mode: "cloud", session } as const;
      const resolved = requestedVersionId
        ? await loadVersionById(requestedVersionId, context)
        : requestedDrillId
          ? await loadEditableVersionForDrill(requestedDrillId, context)
          : null;

      if (!resolved) {
        setHostedSaveState("error");
        setHostedSaveStatusMessage("Unable to load selected drill in cloud workspace.");
        return;
      }

      const packageKey = `hosted:${resolved.versionId}`;
      const entry = createEditablePackageEntry(packageKey, `hosted:${resolved.versionId}`, resolved.packageJson);
      setPackages((current) => [entry, ...current.filter((item) => item.packageKey !== packageKey)]);
      setHostedVersionIdsByPackageKey((current) => ({ ...current, [packageKey]: resolved.versionId }));
      setSelectedPackageKey(packageKey);
      setSelectedPhaseId(getSortedPhases(entry.workingPackage)[0]?.phaseId ?? null);
      setHostedSaveStatusMessage(`Opened ${resolved.title}.`);
    })();
  }, [initialDraftId, initialDrillId, initialHostedDraftId, initialVersionId, isConfigured, persistenceMode, session]);

  useEffect(() => {
    if (persistenceMode !== "local" || !hydrationComplete || !initialDrillId) {
      initializedLocalDrillIdRef.current = null;
      return;
    }

    if (initializedLocalDrillIdRef.current === initialDrillId) {
      return;
    }

    initializedLocalDrillIdRef.current = initialDrillId;

    void (async () => {
      const resolved = await loadEditableVersionForDrill(initialDrillId, { mode: "local" });
      if (!resolved) {
        return;
      }

      const packageKey = `draft:${resolved.versionId}`;
      const existing = packages.find((entry) => entry.packageKey === packageKey);
      const phaseId = getSortedPhases(resolved.packageJson)[0]?.phaseId ?? null;
      if (!existing) {
        const loaded = await loadDraft(resolved.versionId);
        if (!loaded) {
          return;
        }

        const entry = createEditablePackageEntry(packageKey, loaded.record.sourceLabel, loaded.record.packageJson);
        setPackages((current) => [entry, ...current.filter((item) => item.packageKey !== packageKey)]);
        setDraftIdsByPackageKey((current) => ({ ...current, [packageKey]: resolved.versionId }));
        setPackageAssetBlobs((current) => ({ ...current, [packageKey]: loaded.assetsById }));
      }

      setSelectedPackageKey(packageKey);
      setSelectedPhaseId(phaseId);
    })();
  }, [hydrationComplete, initialDrillId, packages, persistenceMode]);

  useEffect(() => {
    if (!initialPackageId) {
      initializedDeepLinkPackageIdRef.current = null;
      return;
    }

    if (initializedDeepLinkPackageIdRef.current === initialPackageId) {
      return;
    }

    const match = packages.find((entry) => entry.workingPackage.manifest.packageId === initialPackageId);
    if (!match) {
      return;
    }

    // Important: deep-link selection is route initialization, not package-content synchronization.
    // If this runs on every packages mutation, normal edits will snap back to phase 1 and clear joint selection.
    initializedDeepLinkPackageIdRef.current = initialPackageId;
    setSelectedPackageKey(match.packageKey);
    setSelectedPhaseId(getSortedPhases(match.workingPackage)[0]?.phaseId ?? null);
    setSelectedJointName(null);
  }, [initialPackageId, packages]);

  useEffect(() => {
    if (persistenceMode !== "local" || !selectedPackageKey) {
      return;
    }

    const entry = packages.find((item) => item.packageKey === selectedPackageKey);
    if (!entry) {
      return;
    }

    const draftId = draftIdsByPackageKey[selectedPackageKey] ?? toDraftIdFromPackage(entry);
    void setLastOpenedDraft(draftId);
  }, [draftIdsByPackageKey, packages, persistenceMode, selectedPackageKey]);

  useEffect(() => {
    const previousIndexes = previousPhaseIndexesRef.current;

    if (packages.length === 0) {
      if (selectedPackageKey !== null) {
        setSelectedPackageKey(null);
      }
      if (selectedPhaseId !== null) {
        setSelectedPhaseId(null);
      }
      if (selectedJointName !== null) {
        setSelectedJointName(null);
      }
      previousPhaseIndexesRef.current = {};
      return;
    }

    const selectedPackageEntry = selectedPackageKey ? packages.find((entry) => entry.packageKey === selectedPackageKey) : null;

    if (!selectedPackageEntry) {
      const fallbackPackage = packages[0] ?? null;
      const fallbackPhaseId = fallbackPackage ? getSortedPhases(fallbackPackage.workingPackage)[0]?.phaseId ?? null : null;

      if (fallbackPackage && fallbackPackage.packageKey !== selectedPackageKey) {
        setSelectedPackageKey(fallbackPackage.packageKey);
      }
      if (fallbackPhaseId !== selectedPhaseId) {
        setSelectedPhaseId(fallbackPhaseId);
      }
      if (selectedJointName !== null) {
        setSelectedJointName(null);
      }
      previousPhaseIndexesRef.current = buildPhaseIndexMap(packages);
      return;
    }

    const sortedPhases = getSortedPhases(selectedPackageEntry.workingPackage);
    const fallbackPhaseId = chooseFallbackPhaseId({
      selectedPhaseId,
      availablePhaseIds: sortedPhases.map((phase) => phase.phaseId),
      previousPhaseIndexes: previousIndexes[selectedPackageEntry.packageKey] ?? {}
    });

    if (fallbackPhaseId !== selectedPhaseId) {
      setSelectedPhaseId(fallbackPhaseId);
      if (selectedJointName !== null) {
        setSelectedJointName(null);
      }
    }

    previousPhaseIndexesRef.current = buildPhaseIndexMap(packages);
  }, [packages, selectedJointName, selectedPackageKey, selectedPhaseId]);

  useEffect(() => {
    if (persistenceMode !== "local" || !hydrationComplete || packages.length === 0) {
      return;
    }

    setLocalSaveState("saving");
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          for (const entry of packages) {
            const fallbackDraftId = toDraftIdFromPackage(entry);
            const packageKeyDraftId = draftIdFromPackageKey(entry.packageKey);
            const draftId = draftIdsByPackageKey[entry.packageKey] ?? packageKeyDraftId ?? fallbackDraftId;
            await saveDraft({
              draftId,
              sourceLabel: entry.sourceLabel,
              packageJson: entry.workingPackage,
              assetsById: packageAssetBlobs[entry.packageKey] ?? {}
            });
            if (!draftIdsByPackageKey[entry.packageKey]) {
              setDraftIdsByPackageKey((current) => ({ ...current, [entry.packageKey]: draftId }));
            }
          }
          setLocalSaveState("saved");
        } catch {
          setLocalSaveState("error");
        }
      })();
    }, 700);

    return () => window.clearTimeout(timer);
  }, [draftIdsByPackageKey, hydrationComplete, packageAssetBlobs, packages, persistenceMode]);

  useEffect(
    () => () => {
      if (persistenceMode !== "local" || !hydrationComplete || packagesRef.current.length === 0) {
        return;
      }

      void (async () => {
        for (const entry of packagesRef.current) {
          const fallbackDraftId = toDraftIdFromPackage(entry);
          const packageKeyDraftId = draftIdFromPackageKey(entry.packageKey);
          const draftId = draftIdsByPackageKeyRef.current[entry.packageKey] ?? packageKeyDraftId ?? fallbackDraftId;
          await saveDraft({
            draftId,
            sourceLabel: entry.sourceLabel,
            packageJson: entry.workingPackage,
            assetsById: packageAssetBlobsRef.current[entry.packageKey] ?? {}
          });
        }
      })();
    },
    [hydrationComplete, persistenceMode]
  );


  useEffect(() => {
    if (persistenceMode === "cloud") {
      setDraftIdsByPackageKey({});
      setLocalSaveState("idle");
      setHydrationComplete(true);
      setPackages((current) => current.filter((entry) => entry.packageKey.startsWith("hosted:")));
      return;
    }

    setHostedVersionIdsByPackageKey({});
    setHostedSaveState("idle");
    setHostedSaveStatusMessage("Browser-local save mode active.");
    setPackages((current) => current.filter((entry) => !entry.packageKey.startsWith("hosted:")));
    hasLoadedDraftsRef.current = false;
  }, [persistenceMode]);

  const saveStatusLabel = selectedPackage
    ? persistenceMode === "cloud"
      ? hostedSaveState === "saving"
        ? "Saving draft to cloud…"
        : hostedSaveState === "error"
          ? "Cloud save failed"
          : selectedPackage.isDirty
            ? "Unsaved cloud changes"
            : "Cloud draft ready"
      : localSaveState === "saving"
        ? "Saving draft on this browser…"
        : localSaveState === "error"
          ? "Local save failed on this browser."
          : selectedPackage.isDirty
            ? "Unsaved local changes"
            : "Draft saved on this browser"
    : "No drill loaded";

  const draftVersionLabel = selectedPackage
    ? `Editing draft for v${selectedPackage.workingPackage.manifest.versioning?.revision ?? 1}`
    : "No draft selected";


  async function saveSelectedToHosted(): Promise<void> {
    if (!selectedPackage) {
      return;
    }
    if (!isConfigured || !session) {
      setHostedSaveState("error");
      setHostedSaveStatusMessage("Sign in to switch to cloud save.");
      return;
    }

    setHostedSaveState("saving");
    const upsert = await upsertHostedLibraryItem(session, selectedPackage.workingPackage);
    if (!upsert.ok) {
      setHostedSaveState("error");
      setHostedSaveStatusMessage("Cloud save failed — edits are still safe on this device.");
      return;
    }

    const versionId = selectedPackage.workingPackage.manifest.versioning?.versionId ?? upsert.value.id;
    setHostedVersionIdsByPackageKey((current) => ({ ...current, [selectedPackage.packageKey]: versionId }));
    setHostedSaveState("saved");
    setHostedSaveStatusMessage(`Saved to account at ${new Date(upsert.value.updatedAtIso).toLocaleString()}.`);
  }

  async function markSelectedVersionReady(): Promise<void> {
    if (!selectedPackage) {
      return;
    }

    const readiness = validateVersionReadiness(selectedPackage.workingPackage);
    if (!readiness.isReady) {
      setImportFeedback({
        status: "error",
        message: `Ready requirements not met (${readiness.issues.length} issue${readiness.issues.length === 1 ? "" : "s"}).`,
        issues: []
      });
      return;
    }

    const versionId = selectedPackage.workingPackage.manifest.versioning?.versionId;
    if (!versionId) {
      setImportFeedback({
        status: "error",
        message: "Cannot mark ready: no draft version ID found.",
        issues: []
      });
      return;
    }

    setImportFeedback({ status: "warning", message: "Marking draft ready…", issues: [] });

    try {
      await markVersionReady(versionId, persistenceMode === "cloud" && session ? { mode: "cloud", session } : { mode: "local" });
      const readyRevision = selectedPackage.workingPackage.manifest.versioning?.revision ?? 1;
      setImportFeedback({
        status: "success",
        message: `Draft marked ready as v${readyRevision}. Returning to Library…`,
        issues: []
      });
      window.setTimeout(() => {
        router.push("/library");
      }, 350);
    } catch {
      setImportFeedback({
        status: "error",
        message: "Could not mark this draft ready. Make sure you are editing an open draft, then try again.",
        issues: []
      });
    }
  }

  async function importFromFile(file: File): Promise<void> {
    const packageKey = packageKeyFromFile(file);
    const result = await readPackageFile(file, packageKey);

    if (!result.ok) {
      setImportFeedback({
        status: "error",
        message: result.error,
        issues: result.validation?.issues ?? []
      });
      return;
    }

    const normalized = ensureVersioningMetadata(result.packageViewModel.package);
    if (!normalized.manifest.versioning?.derivedFrom) {
      const versioning = normalized.manifest.versioning;
      normalized.manifest.versioning = {
        packageSlug: versioning?.packageSlug ?? normalized.manifest.packageId,
        versionId: versioning?.versionId ?? `${normalized.manifest.packageId}@${normalized.manifest.packageVersion}`,
        revision: versioning?.revision ?? 1,
        lineageId: versioning?.lineageId ?? normalized.manifest.packageId,
        draftStatus: versioning?.draftStatus ?? "draft",
        derivedFrom: {
          relation: "import",
          parentPackageId: normalized.manifest.packageId,
          parentVersionId: `${normalized.manifest.packageId}@${normalized.manifest.packageVersion}`,
          note: "Imported from local file"
        }
      };
    }

    const nextEntry = createEditablePackageEntry(result.packageViewModel.packageKey, `local-file:${file.name}`, normalized);
    const nextDraftId = toDraftIdFromPackage(nextEntry);

    setPackages((current) => {
      const withoutExisting = current.filter(
        (entry) => entry.workingPackage.manifest.packageId !== result.packageViewModel.package.manifest.packageId
      );

      return [nextEntry, ...withoutExisting];
    });

    if (result.importedBundle) {
      const importedBundle = result.importedBundle;
      setPackageAssetBlobs((current) => ({
        ...current,
        [nextEntry.packageKey]: Object.fromEntries(Object.entries(importedBundle.assetsById).map(([assetId, payload]) => [assetId, payload.blob]))
      }));

      const phaseEntries = nextEntry.workingPackage.drills.flatMap((drill) =>
        drill.phases.flatMap((phase) =>
          phase.assetRefs
            .filter((asset) => asset.role === "phase-source-image")
            .map((asset) => ({ phaseId: phase.phaseId, asset }))
        )
      );

      const importedPhaseImages = await Promise.all(
        phaseEntries.map(async ({ phaseId, asset }) => {
          const binary = importedBundle.assetsById[asset.assetId];
          if (!binary) {
            return null;
          }

          const sourceImage = await toPhaseSourceImageFromBlob(
            asset.assetId,
            asset.uri,
            binary.path.split("/").pop() ?? `${asset.assetId}.bin`,
            binary.blob,
            "bundled-package"
          );

          return {
            scopeKey: `${nextEntry.packageKey}:${phaseId}`,
            sourceImage
          };
        })
      );

      setPhaseSourceImages((current) => {
        const next = { ...current };
        importedPhaseImages.forEach((entry) => {
          if (entry) {
            next[entry.scopeKey] = entry.sourceImage;
          }
        });
        return next;
      });
    }

    setSelectedPackageKey(nextEntry.packageKey);
    setSelectedPhaseId(getSortedPhases(nextEntry.workingPackage)[0]?.phaseId ?? null);
    setSelectedJointName(null);
    setImportFeedback({
      status: "success",
      message: result.importedBundle
        ? `Imported bundled drill package ${file.name} successfully.`
        : `Imported drill file ${file.name} successfully.`,
      issues: nextEntry.validation.issues
    });
    upsertRegistryEntryFromPackage({
      packageJson: nextEntry.workingPackage,
      sourceType: "imported-local",
      sourceLabel: `local-file:${file.name}`
    });
    setDraftIdsByPackageKey((current) => ({ ...current, [nextEntry.packageKey]: nextDraftId }));
  }

  function loadSampleById(sampleId: string): void {
    const sample = SAMPLE_PACKAGE_DEFINITIONS.find((entry) => entry.id === sampleId);
    if (!sample) {
      setImportFeedback({ status: "error", message: `Sample drill '${sampleId}' was not found.`, issues: [] });
      return;
    }

    const result = loadPackageFromUnknown(sample.payload, `${sample.id}-${Date.now()}`, `sample:${sample.id}`);

    if (!result.ok) {
      setImportFeedback({
        status: "error",
        message: `Failed to load sample drill '${sample.label}'.`,
        issues: result.validation?.issues ?? []
      });
      return;
    }

    const nextEntry = createEditablePackageEntry(
      result.packageViewModel.packageKey,
      `sample:${sample.id}`,
      ensureVersioningMetadata(result.packageViewModel.package)
    );
    const nextDraftId = toDraftIdFromPackage(nextEntry);
    setPackages((current) => {
      const withoutExisting = current.filter(
        (entry) => entry.workingPackage.manifest.packageId !== result.packageViewModel.package.manifest.packageId
      );

      return [nextEntry, ...withoutExisting];
    });

    setSelectedPackageKey(nextEntry.packageKey);
    setSelectedPhaseId(getSortedPhases(nextEntry.workingPackage)[0]?.phaseId ?? null);
    setSelectedJointName(null);
    setImportFeedback({
      status: "success",
      message: `Loaded sample drill '${sample.label}'.`,
      issues: nextEntry.validation.issues
    });
    setDraftIdsByPackageKey((current) => ({ ...current, [nextEntry.packageKey]: nextDraftId }));
  }

  function selectPackage(packageKey: string): void {
    setSelectedPackageKey(packageKey);
    const next = packages.find((entry) => entry.packageKey === packageKey);
    setSelectedPhaseId(next ? getSortedPhases(next.workingPackage)[0]?.phaseId ?? null : null);
    setSelectedJointName(null);

    const draftId = draftIdsByPackageKey[packageKey] ?? next?.workingPackage.manifest.versioning?.versionId;
    if (draftId) {
      void setLastOpenedDraft(draftId);
    }
  }

  function selectPhase(phaseId: string | null): void {
    setSelectedPhaseId(phaseId);
    setSelectedJointName(null);
  }

  function selectJoint(jointName: CanonicalJointName | null): void {
    setSelectedJointName(jointName);
  }

  function updateSelectedPackage(mutator: (entry: EditablePackageEntry) => EditablePackageEntry, nextSelection?: (updated: EditablePackageEntry) => void): void {
    if (!selectedPackageKey) {
      return;
    }

    setPackages((current) =>
      current.map((entry) => {
        if (entry.packageKey !== selectedPackageKey) {
          return entry;
        }

        const updated = mutator(entry);
        nextSelection?.(updated);
        return updated;
      })
    );
  }

  function withPhaseUpdate(phaseId: string, callback: (phase: PortablePhase, view: PortableViewType) => void): void {
    updateSelectedPackage((entry) =>
      updateWorkingPackage(entry, (draft) => {
        const drill = getPrimaryDrill(draft);
        if (!drill) {
          return;
        }

        const phase = drill.phases.find((item) => item.phaseId === phaseId);
        if (!phase) {
          return;
        }

        callback(phase, drill.defaultView);
      })
    );
  }

  function renamePhase(phaseId: string, title: string): void {
    withPhaseUpdate(phaseId, (phase) => {
      phase.title = title;
    });
  }

  function setPhaseDuration(phaseId: string, durationMs: number): void {
    withPhaseUpdate(phaseId, (phase) => {
      phase.durationMs = durationMs;
    });
  }

  function setPhaseSummary(phaseId: string, summary: string): void {
    withPhaseUpdate(phaseId, (phase) => {
      phase.summary = summary;
    });
  }

  function setPhaseView(phaseId: string, view: PortableViewType): void {
    withPhaseUpdate(phaseId, (phase) => {
      phase.poseSequence = phase.poseSequence.map((pose) => ({
        ...pose,
        canvas: {
          ...pose.canvas,
          view
        }
      }));
    });
  }

  function setDrillTitle(title: string): void {
    updateSelectedPackage((entry) =>
      updateWorkingPackage(entry, (draft) => {
        const drill = getPrimaryDrill(draft);
        if (!drill) {
          return;
        }

        drill.title = title;
      })
    );
  }


  function setDrillSlug(slug: string): void {
    updateSelectedPackage((entry) =>
      updateWorkingPackage(entry, (draft) => {
        const drill = getPrimaryDrill(draft);
        if (!drill) {
          return;
        }

        drill.slug = slug;
      })
    );
  }

  function setDrillDescription(description: string): void {
    updateSelectedPackage((entry) =>
      updateWorkingPackage(entry, (draft) => {
        const drill = getPrimaryDrill(draft);
        if (!drill) {
          return;
        }

        drill.description = description;
      })
    );
  }

  function setDrillType(drillType: PortableDrill["drillType"]): void {
    updateSelectedPackage((entry) =>
      updateWorkingPackage(entry, (draft) => {
        const drill = getPrimaryDrill(draft);
        if (!drill) {
          return;
        }

        drill.drillType = drillType;
      })
    );
  }

  function setDrillDifficulty(difficulty: "beginner" | "intermediate" | "advanced"): void {
    updateSelectedPackage((entry) =>
      updateWorkingPackage(entry, (draft) => {
        const drill = getPrimaryDrill(draft);
        if (!drill) {
          return;
        }

        drill.difficulty = difficulty;
      })
    );
  }

  function setDrillDefaultView(view: PortableViewType): void {
    updateSelectedPackage((entry) =>
      updateWorkingPackage(entry, (draft) => {
        const drill = getPrimaryDrill(draft);
        if (!drill) {
          return;
        }

        drill.defaultView = view;
      })
    );
  }

  function setManifestSchemaVersion(schemaVersion: SchemaVersion): void {
    updateSelectedPackage((entry) =>
      updateWorkingPackage(entry, (draft) => {
        draft.manifest.schemaVersion = schemaVersion;
      })
    );
  }


  function setManifestPackageVersion(packageVersion: string): void {
    updateSelectedPackage((entry) =>
      updateWorkingPackage(entry, (draft) => {
        draft.manifest.packageVersion = packageVersion;
      })
    );
  }

  function addPhase(): void {
    let createdPhaseId: string | null = null;
    updateSelectedPackage(
      (entry) =>
        updateWorkingPackage(entry, (draft) => {
          const drill = getPrimaryDrill(draft);
          if (!drill) {
            return;
          }

          normalizePhaseOrder(draft);
          const phases = getSortedPhases(draft);
          const nextOrder = phases.length + 1;
          const phaseId = createStablePhaseId(phases);
          createdPhaseId = phaseId;
          drill.phases.push(createNewPhase(phaseId, nextOrder, drill.defaultView));
          normalizePhaseOrder(draft);
        }),
      (updated) => {
        if (createdPhaseId) {
          setSelectedPhaseId(createdPhaseId);
          return;
        }

        const phases = getSortedPhases(updated.workingPackage);
        setSelectedPhaseId(phases[phases.length - 1]?.phaseId ?? null);
      }
    );
  }

  function deletePhase(phaseId: string): void {
    const deletingSelectedPhase = selectedPhaseId === phaseId;
    let fallbackPhaseAfterDelete: string | null = null;

    updateSelectedPackage(
      (entry) =>
        updateWorkingPackage(entry, (draft) => {
          const drill = getPrimaryDrill(draft);
          if (!drill) {
            return;
          }

          const sortedBeforeDelete = getSortedPhases(draft);
          const deletedIndex = sortedBeforeDelete.findIndex((phase) => phase.phaseId === phaseId);
          drill.phases = drill.phases.filter((phase) => phase.phaseId !== phaseId);
          normalizePhaseOrder(draft);

          if (deletingSelectedPhase) {
            const sortedAfterDelete = getSortedPhases(draft);
            if (sortedAfterDelete.length === 0) {
              fallbackPhaseAfterDelete = null;
              return;
            }

            const neighborIndex = deletedIndex >= sortedAfterDelete.length ? sortedAfterDelete.length - 1 : deletedIndex;
            fallbackPhaseAfterDelete = sortedAfterDelete[Math.max(0, neighborIndex)]?.phaseId ?? sortedAfterDelete[0].phaseId;
          }
        }),
      () => {
        if (!deletingSelectedPhase) {
          return;
        }

        setSelectedPhaseId(fallbackPhaseAfterDelete);
        setSelectedJointName(null);
      }
    );
  }

  function duplicatePhase(phaseId: string): void {
    let duplicatedPhaseId: string | null = null;
    updateSelectedPackage(
      (entry) =>
        updateWorkingPackage(entry, (draft) => {
          const drill = getPrimaryDrill(draft);
          if (!drill) {
            return;
          }

          normalizePhaseOrder(draft);
          const phases = getSortedPhases(draft);
          const sourceIndex = phases.findIndex((phase) => phase.phaseId === phaseId);
          const source = phases[sourceIndex];
          if (!source) {
            return;
          }

          const duplicateId = createStablePhaseId(phases);
          duplicatedPhaseId = duplicateId;
          const duplicated = structuredClone(source);

          duplicated.phaseId = duplicateId;
          duplicated.title = `${source.title} (Copy)`;
          duplicated.order = source.order + 1;

          drill.phases = phases.flatMap((phase) => {
            if (phase.phaseId === source.phaseId) {
              return [phase, duplicated];
            }

            return [phase];
          });
          normalizePhaseOrder(draft);
        }),
      (updated) => {
        const duplicate = getSortedPhases(updated.workingPackage).find((phase) => phase.phaseId === duplicatedPhaseId);
        if (duplicate) {
          setSelectedPhaseId(duplicate.phaseId);
        }
      }
    );
  }

  function movePhase(phaseId: string, direction: "up" | "down"): void {
    updateSelectedPackage((entry) =>
      updateWorkingPackage(entry, (draft) => {
        const drill = getPrimaryDrill(draft);
        if (!drill) {
          return;
        }

        const phases = getSortedPhases(draft);
        const index = phases.findIndex((phase) => phase.phaseId === phaseId);
        const swapIndex = direction === "up" ? index - 1 : index + 1;

        if (index < 0 || swapIndex < 0 || swapIndex >= phases.length) {
          return;
        }

        const next = [...phases];
        [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
        drill.phases = next.map((phase, order) => ({ ...phase, order: order + 1 }));
      })
    );
  }

  function setJointCoordinates(phaseId: string, joint: CanonicalJointName, x: number, y: number): void {
    withPhaseUpdate(phaseId, (phase, view) => {
      setJointCoordinate(phase, joint, { x, y }, view);
    });
  }

  function nudgeJoint(phaseId: string, joint: CanonicalJointName, dx: number, dy: number): void {
    withPhaseUpdate(phaseId, (phase, view) => {
      const pose = phase.poseSequence[0];
      const current = pose?.joints[joint] ?? { x: 0.5, y: 0.5 };
      setJointCoordinate(phase, joint, { x: current.x + dx, y: current.y + dy }, view);
    });
  }

  function revertSelectedJoint(phaseId: string, joint: CanonicalJointName): void {
    if (!selectedPackage) {
      return;
    }

    const sourceDrill = getPrimaryDrill(selectedPackage.sourcePackage);
    const sourcePhase = sourceDrill?.phases.find((phase) => phase.phaseId === phaseId);
    const sourceJoint = sourcePhase?.poseSequence[0]?.joints[joint];

    if (!sourceJoint) {
      return;
    }

    setJointCoordinates(phaseId, joint, sourceJoint.x, sourceJoint.y);
  }

  async function setSelectedPhaseImage(file: File): Promise<void> {
    if (!selectedScopeKey || !selectedPhaseId || !selectedPackage) {
      return;
    }

    const mimeType = file.type || "application/octet-stream";
    const identity = toPhaseAssetIdentity(selectedPhaseId, file.name, mimeType);
    const objectUrl = URL.createObjectURL(file);

    try {
      const image = await loadImageFromObjectUrl(objectUrl);
      const sourceImage: PhaseSourceImage = {
        assetId: identity.assetId,
        portableUri: identity.portableUri,
        objectUrl,
        fileName: file.name,
        mimeType,
        byteSize: file.size,
        width: image.naturalWidth,
        height: image.naturalHeight,
        updatedAtIso: new Date().toISOString(),
        origin: "local-editor"
      };

      setPackageAssetBlobs((current) => ({
        ...current,
        [selectedPackage.packageKey]: {
          ...(current[selectedPackage.packageKey] ?? {}),
          [identity.assetId]: file
        }
      }));

      setPhaseSourceImages((current) => {
        const existing = current[selectedScopeKey];
        if (existing?.objectUrl) {
          URL.revokeObjectURL(existing.objectUrl);
        }

        return {
          ...current,
          [selectedScopeKey]: sourceImage
        };
      });
      setPhaseOverlayState((current) => ({
        ...current,
        [selectedScopeKey]: DEFAULT_PHASE_OVERLAY_STATE
      }));

      setPhaseDetectionState((current) => ({
        ...current,
        [selectedScopeKey]: {
          status: "uploaded",
          result: null,
          message: "Image uploaded. Run detection to preview mapped canonical joints."
        }
      }));

      withPhaseUpdate(selectedPhaseId, (phase) => {
        const nextAsset = toPhaseAssetRef(selectedPhaseId, sourceImage);
        const existingIndex = phase.assetRefs.findIndex((asset) => asset.assetId === nextAsset.assetId);

        if (existingIndex >= 0) {
          phase.assetRefs[existingIndex] = {
            ...phase.assetRefs[existingIndex],
            ...nextAsset
          };
        } else {
          phase.assetRefs = [...phase.assetRefs, nextAsset];
        }
      });

      updateSelectedPackage((entry) =>
        updateWorkingPackage(entry, (draft) => {
          const drill = getPrimaryDrill(draft);
          const rootIndex = draft.assets.findIndex((asset) => asset.assetId === identity.assetId);
          const rootRef: PortableAssetRef = {
            assetId: identity.assetId,
            type: "image",
            role: "phase-source-image",
            ownerDrillId: drill?.drillId,
            ownerPhaseId: selectedPhaseId,
            uri: identity.portableUri,
            mimeType,
            byteSize: file.size
          };

          if (rootIndex >= 0) {
            draft.assets[rootIndex] = rootRef;
          } else {
            draft.assets = [...draft.assets, rootRef];
          }
        })
      );
    } catch {
      URL.revokeObjectURL(objectUrl);
      setPhaseDetectionState((current) => ({
        ...current,
        [selectedScopeKey]: {
          status: "failed",
          result: null,
          message: "Image failed to load. Choose a different file and try again."
        }
      }));
    }
  }

  function clearSelectedPhaseImage(): void {
    if (!selectedScopeKey || !selectedPhaseId || !selectedPackage) {
      return;
    }

    const existing = phaseSourceImages[selectedScopeKey];
    if (existing?.objectUrl) {
      URL.revokeObjectURL(existing.objectUrl);
    }

    setPhaseSourceImages((current) => {
      const next = { ...current };
      delete next[selectedScopeKey];
      return next;
    });
    setPhaseDetectionState((current) => ({
      ...current,
      [selectedScopeKey]: DEFAULT_DETECTION_WORKFLOW_STATE
    }));
    setPhaseOverlayState((current) => ({
      ...current,
      [selectedScopeKey]: DEFAULT_PHASE_OVERLAY_STATE
    }));

    if (existing) {
      setPackageAssetBlobs((current) => {
        const packageBlobs = { ...(current[selectedPackage.packageKey] ?? {}) };
        delete packageBlobs[existing.assetId];

        return {
          ...current,
          [selectedPackage.packageKey]: packageBlobs
        };
      });
    }

    withPhaseUpdate(selectedPhaseId, (phase) => {
      removeTemporaryPhaseAssetRef(phase);
    });

    if (existing) {
      updateSelectedPackage((entry) =>
        updateWorkingPackage(entry, (draft) => {
          draft.assets = draft.assets.filter((asset) => asset.assetId !== existing.assetId);
        })
      );
    }
  }

  function setSelectedPhaseOverlayState(partial: Partial<PhaseOverlayState>): void {
    if (!selectedScopeKey) {
      return;
    }

    setPhaseOverlayState((current) => ({
      ...current,
      [selectedScopeKey]: {
        ...(current[selectedScopeKey] ?? DEFAULT_PHASE_OVERLAY_STATE),
        ...partial
      }
    }));
  }

  function resetSelectedPhaseOverlayState(): void {
    if (!selectedScopeKey) {
      return;
    }

    setPhaseOverlayState((current) => ({
      ...current,
      [selectedScopeKey]: DEFAULT_PHASE_OVERLAY_STATE
    }));
  }

  function openPublishPanel(): void {
    setPublishWorkflow((current) => ({ ...current, panelOpen: true }));
  }

  function selectedPackageEntryId(): string | null {
    if (!selectedPackage) {
      return null;
    }

    return `${selectedPackage.workingPackage.manifest.packageId}@${selectedPackage.workingPackage.manifest.packageVersion}`;
  }

  function addDerivedPackageToStudio(relation: "duplicate" | "fork" | "new-version"): void {
    const source = selectedPackage;
    if (!source) {
      return;
    }

    const derivedPackage = createDerivedPackage({
      source: source.workingPackage,
      relation: relation === "fork" ? "fork" : relation === "duplicate" ? "duplicate" : "new-version"
    });

    const packageKey = `${relation}-${Date.now()}`;
    const sourceEntryId = selectedPackageEntryId();
    const derivedSourceLabel = sourceEntryId ? `${relation}:${sourceEntryId}` : `${relation}:${source.packageKey}`;
    const nextEntry = createEditablePackageEntry(packageKey, derivedSourceLabel, derivedPackage);
    const nextDraftId = toDraftIdFromPackage(nextEntry);
    setPackages((current) => [nextEntry, ...current.filter((entry) => entry.packageKey !== packageKey)]);
    setSelectedPackageKey(packageKey);
    setSelectedPhaseId(getSortedPhases(nextEntry.workingPackage)[0]?.phaseId ?? null);
    setSelectedJointName(null);
    setDraftIdsByPackageKey((current) => ({ ...current, [nextEntry.packageKey]: nextDraftId }));
  }

  function duplicateSelectedPackage(): void {
    addDerivedPackageToStudio("duplicate");
  }

  function forkSelectedPackage(): void {
    addDerivedPackageToStudio("fork");
  }

  function createSelectedPackageNewVersion(): void {
    addDerivedPackageToStudio("new-version");
  }

  function closePublishPanel(): void {
    setPublishWorkflow((current) => ({ ...current, panelOpen: false }));
  }

  function updatePublishingMetadata(partial: Partial<DrillPackagePublishingMetadata>): void {
    updateSelectedPackage((entry) =>
      updateWorkingPackage(entry, (draft) => {
        draft.manifest.publishing = {
          ...(draft.manifest.publishing ?? {}),
          ...partial
        };
      })
    );
  }

  async function runPoseDetectionForSelectedPhase(): Promise<void> {
    if (!selectedScopeKey || !selectedPhaseSourceImage) {
      return;
    }

    setPhaseDetectionState((current) => ({
      ...current,
      [selectedScopeKey]: {
        status: "detecting",
        result: null,
        message: "Running MediaPipe pose detection on uploaded image..."
      }
    }));

    try {
      const image = await loadImageFromObjectUrl(selectedPhaseSourceImage.objectUrl);
      const result = await detectPoseFromImage(image);

      setPhaseDetectionState((current) => ({
        ...current,
        [selectedScopeKey]: {
          status: result.status === "failed" ? "failed" : "detected",
          result,
          message:
            result.status === "failed"
              ? "Pose detection failed. Existing phase pose was preserved."
              : `Detected ${result.coverage.detectedJoints}/${result.coverage.totalCanonicalJoints} canonical joints. Review and apply to replace phase pose.`
        }
      }));
    } catch (error) {
      setPhaseDetectionState((current) => ({
        ...current,
        [selectedScopeKey]: {
          status: "failed",
          result: null,
          message: error instanceof Error ? error.message : "Unexpected detection failure."
        }
      }));
    }
  }

  function applyDetectionToSelectedPhase(): void {
    if (!selectedScopeKey || !selectedPhaseId) {
      return;
    }

    const detectionState = phaseDetectionState[selectedScopeKey];
    const detectionResult = detectionState?.result;

    if (!detectionResult || detectionResult.status === "failed") {
      return;
    }

    withPhaseUpdate(selectedPhaseId, (phase, view) => {
      const poseId = phase.poseSequence[0]?.poseId ?? `${selectedPhaseId}_pose_001`;
      const nextPose = mapDetectionResultToPortablePose(detectionResult, {
        poseId,
        timestampMs: phase.poseSequence[0]?.timestampMs ?? phase.startOffsetMs ?? 0,
        view
      });
      phase.poseSequence = [nextPose];
    });

    setPhaseDetectionState((current) => ({
      ...current,
      [selectedScopeKey]: {
        status: "applied",
        result: detectionResult,
        message: "Detected canonical pose applied to phase. Use manual joint editor for refinements."
      }
    }));
  }

  function exportSelectedPackage(): void {
    if (!selectedPackage) {
      setImportFeedback({ status: "error", message: "No drill file available to export.", issues: [] });
      return;
    }

    const exportPackage = clonePackage(selectedPackage.workingPackage);
    const primaryDrill = getPrimaryDrill(exportPackage);
    if (primaryDrill && !primaryDrill.thumbnailAssetId) {
      const fallback = primaryDrill.phases
        .flatMap((phase) => phase.assetRefs)
        .find((asset) => asset.role === "phase-source-image");
      if (fallback) {
        primaryDrill.thumbnailAssetId = fallback.assetId;
      }
    }

    exportPackage.manifest.updatedAtIso = new Date().toISOString();
    const validation = validatePortableDrillPackage(exportPackage);
    if (validation.errors.length > 0) {
      setImportFeedback({
        status: "error",
        message: `Export blocked: package '${exportPackage.manifest.packageId}' has ${validation.errors.length} validation error(s).`,
        issues: validation.issues
      });
      return;
    }

    void buildBundleForExport(exportPackage, packageAssetBlobs[selectedPackage.packageKey] ?? {}).then((result) => {
      downloadPackageBundle(result.bundle, exportPackage);
      const warningMessage = result.warnings.length > 0 ? ` (${result.warnings.length} asset warning(s))` : "";
      setImportFeedback({
        status: result.warnings.length > 0 ? "warning" : "success",
        message: `Exported bundled drill package ${exportPackage.manifest.packageId}${warningMessage}.`,
        issues: validation.issues
      });
    });
  }

  async function runPublishReadinessCheck(): Promise<void> {
    if (!selectedPackage) {
      setPublishWorkflow((current) => ({
        ...current,
        status: "blocked",
        message: "Load a drill before running publish readiness."
      }));
      return;
    }

    setPublishWorkflow((current) => ({
      ...current,
      status: "validating",
      message: "Validating package for publish readiness..."
    }));

    const readiness = await validatePackagePublishReadiness(selectedPackage.workingPackage);
    setPublishWorkflow((current) => ({
      ...current,
      readiness,
      status: readiness.isReady ? "ready" : "blocked",
      message: readiness.isReady
        ? "Package is publish-ready for local/mock publishing."
        : "Resolve blocking readiness errors before publishing."
    }));
  }

  async function runMockPublish(): Promise<void> {
    if (!selectedPackage) {
      return;
    }

    if (selectedPackage.workingPackage.manifest.versioning?.draftStatus !== "publish-ready") {
      setPublishWorkflow((current) => ({
        ...current,
        status: "blocked",
        message: "Publish blocked: only Ready versions can be published."
      }));
      return;
    }

    const readiness = await validatePackagePublishReadiness(selectedPackage.workingPackage);
    if (!readiness.isReady) {
      setPublishWorkflow((current) => ({
        ...current,
        readiness,
        status: "blocked",
        message: "Publish blocked until readiness errors are fixed."
      }));
      return;
    }

    setPublishWorkflow((current) => ({
      ...current,
      status: "publishing",
      message: "Generating publish artifact and publishing to local/mock registry..."
    }));
    try {
      const artifact = await createPublishArtifact(selectedPackage.workingPackage);
      const metadata = createMockPublishRequestMetadata(artifact);
      const result = await publishService.publish({
        target: "local-mock",
        artifact,
        metadata
      });
      const recentPublishes = await publishService.listRecentPublishes();
      upsertRegistryEntryFromPackage({
        packageJson: selectedPackage.workingPackage,
        sourceType: "mock-published",
        sourceLabel: `mock-registry:${result.recordId}`,
        publishedAtIso: result.publishedAtIso
      });

      setPublishWorkflow((current) => ({
        ...current,
        readiness,
        status: "published",
        lastArtifactChecksumSha256: artifact.checksumSha256,
        lastResult: result,
        recentPublishes,
        panelOpen: true,
        message: `Mock published as ${result.recordId} (${result.locator.uri}).`
      }));
    } catch (error) {
      setPublishWorkflow((current) => ({
        ...current,
        status: "blocked",
        message: error instanceof Error ? error.message : "Mock publish failed unexpectedly."
      }));
    }
  }

  const value: StudioStateValue = {
    packages,
    selectedPackageKey,
    selectedPhaseId,
    selectedJointName,
    importFeedback,
    saveStatusLabel,
    localSaveState,
    hostedSaveState,
    hostedSaveStatusMessage,
    draftVersionLabel,
    selectedPackage,
    selectedPhaseSourceImage,
    selectedPhaseDetection,
    selectedPhaseOverlayState,
    selectPackage,
    selectPhase,
    selectJoint,
    loadSampleById,
    importFromFile,
    exportSelectedPackage,
    renamePhase,
    setPhaseDuration,
    setPhaseSummary,
    setPhaseView,
    setDrillTitle,
    setDrillSlug,
    setDrillDescription,
    setDrillType,
    setDrillDifficulty,
    setDrillDefaultView,
    setManifestSchemaVersion,
    setManifestPackageVersion,
    addPhase,
    deletePhase,
    duplicatePhase,
    movePhase,
    setJointCoordinates,
    nudgeJoint,
    revertSelectedJoint,
    setSelectedPhaseImage,
    clearSelectedPhaseImage,
    runPoseDetectionForSelectedPhase,
    applyDetectionToSelectedPhase,
    setSelectedPhaseOverlayState,
    resetSelectedPhaseOverlayState,
    openPublishPanel,
    closePublishPanel,
    runPublishReadinessCheck,
    runMockPublish,
    publishWorkflow,
    updatePublishingMetadata,
    duplicateSelectedPackage,
    forkSelectedPackage,
    createSelectedPackageNewVersion,
    saveSelectedToHosted,
    markSelectedVersionReady,
    persistenceMode
  };

  return <StudioStateContext.Provider value={value}>{children}</StudioStateContext.Provider>;
}

export function useStudioState(): StudioStateValue {
  const context = useContext(StudioStateContext);

  if (!context) {
    throw new Error("useStudioState must be used within StudioStateProvider.");
  }

  return context;
}
