import type { DrillPackage } from "@/lib/schema/contracts";
import type { DrillKnowledgeDocument, KnowledgeSourceRef } from "./types";

const MOVEMENT_FAMILY_KEYWORDS: Array<{ family: string; keywords: string[] }> = [
  { family: "squat", keywords: ["squat", "sit"] },
  { family: "hinge", keywords: ["hinge", "deadlift", "rdl"] },
  { family: "push", keywords: ["push", "press", "pushup", "push-up"] },
  { family: "pull", keywords: ["pull", "row", "chin", "pullup", "pull-up"] },
  { family: "lunge", keywords: ["lunge", "split squat"] },
  { family: "core", keywords: ["plank", "hollow", "core", "ab"] },
  { family: "mobility", keywords: ["mobility", "stretch", "range of motion"] }
];

const EQUIPMENT_KEYWORDS = [
  "barbell",
  "dumbbell",
  "kettlebell",
  "band",
  "resistance band",
  "bench",
  "chair",
  "wall",
  "box",
  "pull-up bar",
  "bodyweight",
  "mat"
] as const;

function uniqueNormalized(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function inferMovementFamilies(tokens: string[]): string[] {
  const lowerTokens = tokens.map((token) => token.toLowerCase());
  return MOVEMENT_FAMILY_KEYWORDS
    .filter((candidate) => candidate.keywords.some((keyword) => lowerTokens.some((token) => token.includes(keyword))))
    .map((candidate) => candidate.family);
}

function inferEquipment(tokens: string[]): string[] {
  const lowerTokens = tokens.map((token) => token.toLowerCase());
  return EQUIPMENT_KEYWORDS.filter((keyword) => lowerTokens.some((token) => token.includes(keyword)));
}

function inferOrientationNotes(view: DrillPackage["drills"][number]["primaryView"]): string {
  if (view === "side") return "Best analyzed from a side view for clearer joint-angle changes.";
  if (view === "rear") return "Use a rear view to keep left/right alignment checks consistent.";
  return "Use a front view with the full body centered in frame.";
}

function buildDetectionCaveats(pkg: DrillPackage): string[] {
  const drill = pkg.drills[0];
  if (!drill) {
    return ["No drill definition found; detection notes are unavailable."];
  }

  const caveats = [
    `Primary view is ${drill.primaryView}; alternate camera views can reduce match confidence.`,
    "Keep all required joints in frame to avoid low-confidence phase classification."
  ];

  if (drill.analysis?.measurementType === "hold") {
    caveats.push("Hold timing relies on stable pose visibility through the entire hold phase.");
  }

  if (drill.analysis?.measurementType === "rep") {
    caveats.push("Rep counting assumes the ordered phase sequence remains visually distinguishable.");
  }

  if ((drill.analysis?.minimumConfirmationFrames ?? 0) > 1) {
    caveats.push(`Phase transitions require at least ${drill.analysis?.minimumConfirmationFrames} confirmation frames.`);
  }

  return uniqueNormalized(caveats);
}

function buildPhaseOverview(pkg: DrillPackage): string[] {
  const phases = pkg.drills[0]?.phases ?? [];
  return phases
    .sort((a, b) => a.order - b.order)
    .map((phase, index) => {
      const summary = phase.summary?.trim();
      return summary
        ? `${index + 1}. ${phase.name}: ${summary}`
        : `${index + 1}. ${phase.name}`;
    });
}

function buildSummary(pkg: DrillPackage): string {
  const drill = pkg.drills[0];
  if (!drill) {
    return "Derived drill knowledge scaffold.";
  }

  if (drill.description?.trim()) {
    return drill.description.trim();
  }

  const phaseCount = drill.phases.length;
  const drillTypeLabel = drill.drillType === "hold" ? "hold" : "rep";
  return `${drill.title} is a ${drillTypeLabel} drill with ${phaseCount} phase${phaseCount === 1 ? "" : "s"}.`;
}

function buildSourceRefs(pkg: DrillPackage): KnowledgeSourceRef[] {
  const drill = pkg.drills[0];
  const refs: KnowledgeSourceRef[] = [
    {
      sourceType: "drill_definition",
      sourceId: drill?.drillId ?? pkg.manifest.packageId,
      label: drill?.title
    }
  ];

  (drill?.phases ?? []).forEach((phase) => {
    refs.push({
      sourceType: "phase_definition",
      sourceId: phase.phaseId,
      label: phase.name
    });
  });

  if (pkg.manifest.versioning?.draftStatus === "publish-ready") {
    refs.push({
      sourceType: "published_version",
      sourceId: pkg.manifest.versioning?.versionId ?? pkg.manifest.packageVersion,
      label: pkg.manifest.packageVersion
    });
  }

  return refs;
}

function versionKey(pkg: DrillPackage): string {
  return pkg.manifest.versioning?.versionId ?? pkg.manifest.packageVersion;
}

function toSimilarityTokenSet(pkg: DrillPackage): Set<string> {
  const drill = pkg.drills[0];
  const tags = drill?.tags ?? [];
  const categories = pkg.manifest.publishing?.categories ?? [];
  const title = drill?.title ?? "";
  return new Set([...tags, ...categories, title.toLowerCase()]);
}

export function suggestRelatedDrillIds(basePackage: DrillPackage, candidates: DrillPackage[]): string[] {
  const baseId = basePackage.manifest.packageId;
  const baseTokens = toSimilarityTokenSet(basePackage);

  return candidates
    .filter((candidate) => candidate.manifest.packageId !== baseId)
    .map((candidate) => {
      const candidateTokens = toSimilarityTokenSet(candidate);
      const sharedScore = Array.from(baseTokens).reduce((score, token) => score + (candidateTokens.has(token) ? 1 : 0), 0);
      return {
        drillId: candidate.manifest.packageId,
        score: sharedScore
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.drillId.localeCompare(b.drillId))
    .slice(0, 5)
    .map((entry) => entry.drillId);
}

export function buildDrillKnowledgeDocument(input: {
  packageJson: DrillPackage;
  candidatePackages?: DrillPackage[];
}): DrillKnowledgeDocument {
  const pkg = input.packageJson;
  const drill = pkg.drills[0];
  const fallbackTitle = drill?.title?.trim() || pkg.manifest.publishing?.title?.trim() || pkg.manifest.packageId;
  const tokens = uniqueNormalized([
    fallbackTitle,
    ...(drill?.tags ?? []),
    ...(pkg.manifest.publishing?.categories ?? []),
    ...(pkg.manifest.publishing?.tags ?? [])
  ]);

  const drillId = drill?.drillId ?? pkg.manifest.packageId;
  const drillVersionId = versionKey(pkg);

  const movementFamily = inferMovementFamilies(tokens);
  const equipment = inferEquipment(tokens);
  const relatedDrillIds = input.candidatePackages ? suggestRelatedDrillIds(pkg, input.candidatePackages) : [];

  return {
    id: `knowledge:${drillId}:${drillVersionId}`,
    drillId,
    drillVersionId,
    title: fallbackTitle,
    summary: buildSummary(pkg),
    movementFamily,
    equipment,
    orientationNotes: inferOrientationNotes(drill?.primaryView ?? "front"),
    phaseOverview: buildPhaseOverview(pkg),
    prerequisites: [],
    regressions: [],
    progressions: [],
    commonMistakes: [],
    detectionCaveats: buildDetectionCaveats(pkg),
    relatedDrillIds,
    sourceRefs: buildSourceRefs(pkg),
    updatedAt: pkg.manifest.updatedAtIso
  };
}
