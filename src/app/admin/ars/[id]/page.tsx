import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RoundsPanel } from "@/features/ars/components/rounds-panel";
import { parseRoundError, parseRoundNotice, roundErrorKey, roundNoticeKey } from "@/features/ars/list-params";
import { listRounds } from "@/features/ars/queries/list-rounds";
import { RoleShell } from "@/features/auth/components/role-shell";
import { requireRole } from "@/features/auth/guards";
import { parseCourseId } from "@/features/curriculum/list-params";
import { getCourse } from "@/features/curriculum/queries/get-course";

export const metadata: Metadata = { title: "ARS process" };
const first = (value: string | string[] | undefined) => typeof value === "string" ? value : undefined;

export default async function AdminArsProcessPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await requireRole("admin");
  const courseId = parseCourseId((await params).id);
  if (courseId === null) notFound();
  const [course, rounds] = await Promise.all([getCourse(courseId), listRounds(courseId)]);
  if (!course) notFound();
  const query = await searchParams;
  return <RoleShell profile={profile} title={`${course.title} ARS`}><p><Link href="/admin/ars">← All ARS processes</Link></p><RoundsPanel courseId={courseId} error={parseRoundError(first(query[roundErrorKey]))} notice={parseRoundNotice(first(query[roundNoticeKey]))} rounds={rounds} /></RoleShell>;
}
