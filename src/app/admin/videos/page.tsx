import type { Metadata } from "next";

import { requireRole } from "@/features/auth/guards";
import { parsePageNumber } from "@/features/documents/list-params";
import { VideosScreen } from "@/features/video/components/videos-screen";
import { listVideos } from "@/features/video/queries/list-videos";
import { parseVideoMessage } from "@/features/video/video";

export const metadata: Metadata = { title: "Videos" };

export default async function AdminVideosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("admin");
  const params = await searchParams;
  const page = parsePageNumber(typeof params.page === "string" ? params.page : undefined);

  return (
    <VideosScreen
      message={parseVideoMessage(params.notice)}
      profile={profile}
      videos={await listVideos(page)}
    />
  );
}
