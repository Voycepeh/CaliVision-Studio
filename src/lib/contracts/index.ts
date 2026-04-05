export type {
  CanonicalJointName,
  DrillManifest,
  DrillPackage,
  PortableAssetRef,
  PortableCanvasSpec,
  PortableDrill,
  PortablePhase,
  PortablePose,
  PortableViewType,
  SchemaVersion
} from "@/lib/schema/contracts";

export { validateDrillPackage, validateTypedDrill } from "@/lib/schema/validate";
export type { ValidationIssue, ValidationResult } from "@/lib/schema/validate";
