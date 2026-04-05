import { StudioLayout } from "@/components/layout/StudioLayout";
import { InspectorPanel } from "@/components/studio/InspectorPanel";
import { LibraryPanel } from "@/components/studio/LibraryPanel";
import { WorkspacePanel } from "@/components/studio/WorkspacePanel";

/**
 * Flagship Studio route wired to the 3-panel authoring workspace.
 *
 * Keeping this as an explicit App Router page avoids regressions where
 * navigation links point to /studio without a backing route.
 */
export default function StudioPage() {
  return <StudioLayout left={<LibraryPanel />} center={<WorkspacePanel />} right={<InspectorPanel />} />;
}
