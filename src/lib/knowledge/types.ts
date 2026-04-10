export type KnowledgeSourceType = "drill_definition" | "phase_definition" | "user_notes" | "published_version";

export type KnowledgeSourceRef = {
  sourceType: KnowledgeSourceType;
  sourceId: string;
  label?: string;
};

export type DrillKnowledgeDocument = {
  id: string;
  drillId: string;
  drillVersionId?: string;
  title: string;
  summary: string;
  movementFamily: string[];
  equipment: string[];
  orientationNotes: string;
  phaseOverview: string[];
  prerequisites: string[];
  regressions: string[];
  progressions: string[];
  commonMistakes: string[];
  detectionCaveats: string[];
  relatedDrillIds: string[];
  sourceRefs: KnowledgeSourceRef[];
  updatedAt: string;
};
