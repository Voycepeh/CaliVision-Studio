import { RoutePageIntro } from "@/components/layout/RoutePageIntro";
import { HistoryWorkspace } from "@/components/history/HistoryWorkspace";

export default function HistoryPage() {
  return (
    <RoutePageIntro
      navActive="history"
      title="History"
      description="Review your recent Upload Video and Live Streaming attempts to track progress over time."
    >
      <HistoryWorkspace />
    </RoutePageIntro>
  );
}
