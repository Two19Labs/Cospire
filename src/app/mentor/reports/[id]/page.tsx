import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ReportEditor } from "@/features/ars-report/components/report-editor";
import { getReport } from "@/features/ars-report/queries/get-report";
import { requireRole } from "@/features/auth/guards";

export const metadata: Metadata = { title: "ARS report" };

export default async function MentorReportPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireRole("mentor");
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id)) notFound();
  const report = await getReport(Number(id));
  if (!report) notFound();
  return <ReportEditor profile={profile} report={report} />;
}
