import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ReportViewScreen } from "@/features/ars-report/components/report-view";
import { getReport } from "@/features/ars-report/queries/get-report";
import { requireRole } from "@/features/auth/guards";

export const metadata: Metadata = { title: "Your ARS report" };

export default async function StudentReportPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireRole("student");
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id)) notFound();
  const report = await getReport(Number(id));
  if (!report || report.status !== "released") notFound();
  return <ReportViewScreen profile={profile} report={report} />;
}
