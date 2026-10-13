"use client";

import { useEffect, useRef } from "react";

import { recordVideoProgressAction } from "../actions/record-video-progress";

// The VdoCipher v2 player API: https://player.vdocipher.com/v2/api.js exposes
// `VdoPlayer.getInstance(iframe)`, whose `video` behaves like an
// HTMLVideoElement (docs: player/v2/api-reference/accessing-player).
interface VdoVideo {
  addEventListener(type: string, listener: () => void): void;
  currentTime: number;
}
declare global {
  interface Window {
    VdoPlayer?: { getInstance(iframe: HTMLIFrameElement): { video: VdoVideo } };
  }
}

const apiSrc = "https://player.vdocipher.com/v2/api.js";
// ponytail: a report every 15 s of play, plus on pause and end; tighten only if
// resume positions are reported as too coarse.
const reportEveryMs = 15_000;

function loadApi(): Promise<void> {
  if (window.VdoPlayer) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${apiSrc}"]`);
  const script = existing ?? Object.assign(document.createElement("script"), { async: true, src: apiSrc });
  if (!existing) document.head.append(script);
  return new Promise((resolve, reject) => {
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error("player api")));
  });
}

// The player plus progress: where the student is, saved to item_progress, and
// where they left off, restored on load. Playback works without any of this;
// if the API script fails, only progress is lost.
export function TrackedVideoFrame({
  itemId,
  resumeAt,
  src,
  title,
}: {
  itemId: number;
  resumeAt: number;
  src: string;
  title: string;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let lastReport = 0;
    let cancelled = false;

    loadApi()
      .then(() => {
        const frame = frameRef.current;
        if (cancelled || !frame || !window.VdoPlayer) return;
        const { video } = window.VdoPlayer.getInstance(frame);
        const report = () => {
          lastReport = Date.now();
          void recordVideoProgressAction(itemId, video.currentTime).catch(() => undefined);
        };
        video.addEventListener("loadedmetadata", () => {
          if (resumeAt > 0) video.currentTime = resumeAt;
        });
        video.addEventListener("timeupdate", () => {
          if (Date.now() - lastReport >= reportEveryMs) report();
        });
        video.addEventListener("pause", report);
        video.addEventListener("ended", report);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [itemId, resumeAt]);

  return (
    <iframe
      allow="encrypted-media; fullscreen"
      allowFullScreen
      ref={frameRef}
      src={src}
      style={{ border: 0, height: "100%", width: "100%" }}
      title={title}
    />
  );
}
