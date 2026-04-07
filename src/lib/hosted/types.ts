import type { DrillPackage } from "@/lib/schema/contracts";

export type HostedDraftSummary = {
  id: string;
  title: string;
  summary: string;
  status: "draft" | "ready";
  packageId: string;
  packageVersion: string;
  schemaVersion: string;
  revision: number;
  updatedAtIso: string;
};

export type HostedDraftRecord = HostedDraftSummary & {
  ownerUserId: string;
  content: DrillPackage;
};
