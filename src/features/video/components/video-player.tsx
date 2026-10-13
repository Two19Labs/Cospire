import type { VideoPlayback } from "../queries/get-video-playback";
import { videoStatusLabels } from "../video";

// VdoCipher's own player in an iframe. It carries the DRM and draws the
// per-viewer watermark requested with the OTP, so nothing here can strip it.
// The OTP expires in minutes, so a copied URL stops working.
export function VideoPlayer({ view }: { view: VideoPlayback }) {
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
      <iframe
        allow="encrypted-media; fullscreen"
        allowFullScreen
        src={src}
        style={{ border: 0, height: "100%", width: "100%" }}
        title={view.title}
      />
    </div>
  );
}
