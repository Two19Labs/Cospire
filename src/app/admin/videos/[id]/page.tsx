import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RoleShell } from "@/features/auth/components/role-shell";
import { requireRole } from "@/features/auth/guards";
import { parsePositiveId } from "@/features/curriculum/curriculum";
import { DeleteLink } from "@/features/delete/components/delete-link";
import { VideoPlayer } from "@/features/video/components/video-player";
import { getVideoPlayback } from "@/features/video/queries/get-video-playback";

export const metadata: Metadata = { title: "Video" };

// An admin's preview, through the same access check and OTP as a student's.
export default async function AdminVideoPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireRole("admin");
  const videoId = parsePositiveId((await params).id);
  if (videoId === null) notFound();

  const view = await getVideoPlayback({ videoId, viewer: profile });
  if (!view) notFound();

  return (
    <RoleShell
      // D42: a video takes its grants, its curriculum items, its progress rows
      // and the video in VdoCipher itself.
      actions={<DeleteLink id={videoId} type="video" />}
      back={{ href: "/admin/videos", label: "Videos" }}
      heading={view.title}
      profile={profile}
      title={view.title}
    >
      <section className="panel">
        <VideoPlayer view={view} />
      </section>
    </RoleShell>
  );
}
