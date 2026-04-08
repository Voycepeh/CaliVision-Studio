import type { DrillPackage } from "@/lib/schema/contracts";

export type DraftPromotionResult = {
  title: string;
  phaseCount: number;
};

export async function promoteLocalDraftToLocalLibrary(input: {
  loadDraftPackage: () => Promise<DrillPackage | null>;
  saveToMyDrills: (pkg: DrillPackage) => Promise<{ title: string }>;
  deleteDraft: () => Promise<void>;
}): Promise<DraftPromotionResult> {
  const pkg = await input.loadDraftPackage();
  if (!pkg) {
    throw new Error("Draft could not be loaded.");
  }

  const saved = await input.saveToMyDrills(pkg);
  await input.deleteDraft();

  return {
    title: saved.title,
    phaseCount: pkg.drills[0]?.phases.length ?? 0
  };
}

export async function promoteHostedDraftToHostedLibrary(input: {
  loadDraftPackage: () => Promise<DrillPackage>;
  saveToMyDrills: (pkg: DrillPackage) => Promise<{ title: string }>;
  deleteDraft: () => Promise<void>;
}): Promise<DraftPromotionResult> {
  const pkg = await input.loadDraftPackage();
  const saved = await input.saveToMyDrills(pkg);
  await input.deleteDraft();

  return {
    title: saved.title,
    phaseCount: pkg.drills[0]?.phases.length ?? 0
  };
}
