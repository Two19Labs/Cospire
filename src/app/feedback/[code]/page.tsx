import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FeedbackScreen } from "@/features/feedback/components/feedback-screen";
import { feedbackMode, listThoughts } from "@/features/feedback/store";

// Never indexed, never cached: the URL is the key.
export const metadata: Metadata = { referrer: "no-referrer", robots: { follow: false, index: false }, title: "Feedback" };
export const dynamic = "force-dynamic";

export default async function FeedbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { code } = await params;
  const mode = feedbackMode(code);
  if (!mode) notFound();
  const notice = (await searchParams).notice;
  return <FeedbackScreen code={code} mode={mode} notice={typeof notice === "string" ? notice : undefined} thoughts={await listThoughts()} />;
}
