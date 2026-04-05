import validSamplePackage from "@/lib/package/samples/valid-sample-package.json";
import invalidSamplePackage from "@/lib/package/samples/invalid-sample-package.json";
import type { DrillPackage } from "@/lib/schema/contracts";

export type SamplePackageDefinition = {
  id: string;
  label: string;
  description: string;
  payload: unknown;
  expectedValidity: "valid" | "invalid";
};

export const SAMPLE_PACKAGE_DEFINITIONS: SamplePackageDefinition[] = [
  {
    id: "sample-valid-reactive-defense",
    label: "Reactive Defense (valid)",
    description: "Android-compatible sample drill file used as a local bootstrap fixture.",
    payload: validSamplePackage,
    expectedValidity: "valid"
  },
  {
    id: "sample-invalid-validation-fixture",
    label: "Invalid sample drill file",
    description: "Intentionally invalid drill file for testing error surfacing in Studio.",
    payload: invalidSamplePackage,
    expectedValidity: "invalid"
  }
];

export function getPrimarySamplePackage(): DrillPackage {
  return validSamplePackage as DrillPackage;
}
