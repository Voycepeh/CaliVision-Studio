import { StudioLayout } from "@/components/layout/StudioLayout";
import { InspectorPanel } from "@/components/studio/InspectorPanel";
import { LibraryPanel } from "@/components/studio/LibraryPanel";
import { WorkspacePanel } from "@/components/studio/WorkspacePanel";

export default function StudioPage() {
  return <StudioLayout left={<LibraryPanel />} center={<WorkspacePanel />} right={<InspectorPanel />} />;
}
