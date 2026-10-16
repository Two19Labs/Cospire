import type { VideoPlayback } from "../queries/get-video-playback";
import { videoStatusLabels } from "../video";
import { TrackedVideoFrame } from "./tracked-video-frame";

// VdoCipher's own player in an iframe. It carries the DRM and draws the
// per-viewer watermark requested with the OTP, so nothing here can strip it.
// The OTP expires in minutes, so a copied URL stops working.
// With `progress`, a student's position is saved and restored.
export function VideoPlayer({
  progress,
  view,
}: {
  progress?: { itemId: number; resumeAt: number };
  view: VideoPlayback;
}) {
  if (!view.playback) {
    return (
      <p className="panel-empty">
        This video is not ready to watch yet ({videoStatusLabels[view.status].toLowerCase()}).
        Try again later.
      </p>
    );
  }

  const src = `https://player.vdocipher.com/v2/?${new URLSearchParams({
    otp: view.playback.otp,
    playbackInfo: view.playback.playbackInfo,
  }).toString()}`;

  return (
    <div style={{ aspectRatio: "16 / 9", width: "100%" }}>
      {progress ? (
        <TrackedVideoFrame
          itemId={progress.itemId}
          resumeAt={progress.resumeAt}
          src={src}
          title={view.title}
        />
      ) : (
        <iframe
          allow="encrypted-media; fullscreen"
          allowFullScreen
          src={src}
          style={{ border: 0, height: "100%", width: "100%" }}
          title={view.title}
        />
      )}
    </div>
  );
}
