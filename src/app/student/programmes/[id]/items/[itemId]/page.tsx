import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { StudentReadingScreen } from "@/features/curriculum/components/student-programme";
import { parsePositiveId, studentReturnHref } from "@/features/curriculum/curriculum";
import { getStudentProgramme } from "@/features/curriculum/queries/student-programmes";
import { StudentVideoScreen } from "@/features/video/components/student-video-screen";
import { getResumePosition, getVideoPlayback } from "@/features/video/queries/get-video-playback";

export const metadata: Metadata = { title: "Programme item" };

// A text or video item. Documents open in the existing viewer and tests in the
// mock screen, so only readings and videos have a page of their own.
export default async function StudentProgrammeItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; itemId: string }>;
  searchParams: Promise<{ module?: string }>;
}) {
  const profile = await requireRole("student");
  const { id, itemId } = await params;
  const courseId = parsePositiveId(id);
  const parsedItemId = parsePositiveId(itemId);
  if (courseId === null || parsedItemId === null) notFound();
  // Set when the item was opened from a module page; only a positive integer counts.
  const moduleId = parsePositiveId((await searchParams).module);

  const view = await getStudentProgramme(courseId, profile.id);
  // A subject's own item, or an item inside a module attached to one of its subjects.
  const item = [...(view?.sections.flatMap((section) => section.items) ?? []), ...(view ? [...view.modules.values()].flat().flatMap((m) => m.items) : [])]
    .find((entry) => entry.id === parsedItemId && (entry.type === "text" || entry.type === "video"));
  if (!view || !item) notFound();
  const fromModule = moduleId === null ? undefined : [...view.modules.values()].flat().find((m) => m.id === moduleId);
  const returnId = fromModule ? moduleId : null;

  if (item.type === "video") {
    // The OTP is minted only if `videos_select_authorized` returns the row.
    const [playback, resumeAt] = await Promise.all([
      item.refId === null ? null : getVideoPlayback({ videoId: item.refId, viewer: profile }),
      getResumePosition(courseId, item.id),
    ]);
    if (!playback) notFound();
    return (
      <StudentVideoScreen
        backHref={studentReturnHref(courseId, returnId)}
        backLabel={`Back to ${fromModule?.title ?? view.programme.title}`}
        profile={profile}
        progress={{ courseId, itemId: item.id, resumeAt }}
        view={playback}
      />
    );
  }

  return (
    <StudentReadingScreen
      courseId={courseId}
      done={view.complete.has(item.id)}
      item={item}
      moduleId={returnId}
      moduleTitle={fromModule?.title ?? null}
      profile={profile}
      programmeTitle={view.programme.title}
    />
  );
}
