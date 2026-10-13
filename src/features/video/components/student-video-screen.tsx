import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";

import type { VideoPlayback } from "../queries/get-video-playback";
import { VideoPlayer } from "./video-player";

export function StudentVideoScreen({
  backHref,
  backLabel,
  profile,
  view,
}: {
  backHref: string;
  backLabel: string;
  profile: Profile;
  view: VideoPlayback;
}) {
  return (
    <RoleShell
      back={{ href: backHref, label: backLabel }}
      description="Video"
      profile={profile}
      title={view.title}
    >
      <section className="panel">
        <VideoPlayer view={view} />
      </section>
    </RoleShell>
  );
}
