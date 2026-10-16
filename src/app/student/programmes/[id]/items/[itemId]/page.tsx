import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { StudentReadingScreen } from "@/features/curriculum/components/student-programme";
import { parsePositiveId } from "@/features/curriculum/curriculum";
import { getStudentProgramme } from "@/features/curriculum/queries/student-programmes";
import { StudentVideoScreen } from "@/features/video/components/student-video-screen";
import { getResumePosition, getVideoPlayback } from "@/features/video/queries/get-video-playback";

export const metadata: Metadata = { title: "Programme item" };

// A text or video item. Documents open in the existing viewer and tests in the
// mock screen, so only readings and videos have a page of their own.
export default async function StudentProgrammeItemPage({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>;
}) {
  const profile = await requireRole("student");
  const { id, itemId } = await params;
  const courseId = parsePositiveId(id);
  const parsedItemId = parsePositiveId(itemId);
  if (courseId === null || parsedItemId === null) notFound();

  const view = await getStudentProgramme(courseId, profile.id);
  const item = view?.sections
    .flatMap((section) => section.items)
    .find((entry) => entry.id === parsedItemId && (entry.type === "text" || entry.type === "video"));
  if (!view || !item) notFound();

  if (item.type === "video") {
    // The OTP is minted only if `videos_select_authorized` returns the row.
    const [playback, resumeAt] = await Promise.all([
      item.refId === null ? null : getVideoPlayback({ videoId: item.refId, viewer: profile }),
      getResumePosition(item.id),
    ]);
    if (!playback) notFound();
    return (
      <StudentVideoScreen
        backHref={`/student/programmes/${courseId}`}
        backLabel={`Back to ${view.programme.title}`}
        profile={profile}
        progress={{ itemId: item.id, resumeAt }}
        view={playback}
      />
    );
  }

  return (
    <StudentReadingScreen
      courseId={courseId}
      done={view.complete.has(item.id)}
      item={item}
      profile={profile}
      programmeTitle={view.programme.title}
    />
  );
}
