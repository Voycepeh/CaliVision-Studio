import { RoutePageIntro } from "@/components/layout/RoutePageIntro";
import { AttemptDetailWorkspace } from "@/components/history/AttemptDetailWorkspace";

export default async function HistoryAttemptDetailPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  return (
    <RoutePageIntro
      navActive="history"
      title="Attempt detail"
      description="Review one attempt and hand off into Compare."
    >
      <AttemptDetailWorkspace attemptId={attemptId} />
    </RoutePageIntro>
  );
}
