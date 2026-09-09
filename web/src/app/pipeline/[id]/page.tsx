import { notFound } from "next/navigation";
import { readReport, findApplication, readApplications, trackerCanDelete } from "@/lib/career-ops";
import { ReportView } from "@/components/report-view";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const app = findApplication(id);
  const report = readReport(id);
  if (!app && !report) notFound();

  // Adjacent reports in tracker order — powers the prev/next triage nav
  // (reading 10 reports in a row without returning to the table).
  const all = readApplications();
  const ix = all.findIndex((a) => a.n === id);
  const prevId = ix > 0 ? all[ix - 1].n : null;
  const nextId = ix >= 0 && ix < all.length - 1 ? all[ix + 1].n : null;

  return (
    <ReportView
      id={id}
      app={app}
      report={report?.content ?? null}
      file={report?.file ?? null}
      canDelete={trackerCanDelete()}
      prevId={prevId}
      nextId={nextId}
    />
  );
}
