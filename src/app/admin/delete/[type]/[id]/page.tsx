import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { DeleteScreen } from "@/features/delete/components/delete-screen";
import { getDeletePreview } from "@/features/delete/queries/delete-preview";
import { parseDeleteTargetType } from "@/features/delete/targets";

export const metadata: Metadata = { title: "Delete" };

// One confirmation screen for all four kinds of thing: the counts come from the
// database and the words from `targets.ts`, so adding a kind is a row there.
export default async function AdminDeletePage({ params, searchParams }: {
  params: Promise<{ id: string; type: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("admin");
  const { id, type: rawType } = await params;
  const type = parseDeleteTargetType(rawType);
  const numericId = Number(id);
  if (type === null || !Number.isSafeInteger(numericId) || numericId <= 0) notFound();

  // Null is "not there, or not this organisation's". A 404 either way: saying
  // which would disclose that it exists.
  const preview = await getDeletePreview(type, numericId);
  if (!preview) notFound();

  const error = (await searchParams).error;
  return <DeleteScreen error={typeof error === "string" ? error : undefined} preview={preview} profile={profile} />;
}
