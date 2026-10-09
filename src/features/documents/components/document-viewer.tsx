"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/shared/ui";

interface DocumentViewerProps {
  fileUrl: string;
  watermark: string;
}

// Draws the watermark over a page that has already been rendered.
//
// One small mark, bottom left, drawn once per page (D10) -- not the rotated
// tiling this used to be. The earlier tiling argued that cropping one
// instance out of a screenshot leaves several others, which is still true: a
// single corner mark is weaker deterrence, and a crop tight enough to miss
// the bottom-left corner escapes attribution entirely. The Client asked for
// the lighter mark anyway because the tiling made the document harder to
// read, and the owner has a standing action to tell them plainly what this
// does and does not stop (see CONTEXT.md). The identity text is unchanged --
// composed server-side in `composeWatermark`, never from anything the client
// sends -- and the alpha is higher than the old tiling used, because one mark
// now carries the whole burden of being legible that many tiles used to
// share.
function drawWatermark(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  text: string,
): void {
  const fontSize = Math.max(11, Math.round(width / 70));
  const padding = Math.round(fontSize * 1.1);

  context.save();
  context.globalAlpha = 0.4;
  context.fillStyle = "#0f172a";
  context.font = `${fontSize}px ui-sans-serif, system-ui, sans-serif`;
  context.textAlign = "left";
  context.textBaseline = "bottom";
  context.fillText(text, padding, height - padding);
  context.restore();
}

// PDF.js onto a canvas, per technical brief §8.
//
// The page becomes a drawing rather than a file, so there is no built-in
// download or print control and a right-click saves an image of one page at
// best. That is friction plus traceability, not prevention: if a browser can
// render a PDF then the bytes were delivered, and a determined reader can
// photograph the screen. The watermark is what makes that traceable, and it is
// the honest defence. Clause 15.3 records that the Client accepts the same
// trade for video.
//
// No context-menu blocking. It stops nobody, breaks accessibility tooling, and
// trades real usability for the appearance of security.
export function DocumentViewer({ fileUrl, watermark }: DocumentViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"error" | "loading" | "ready">("loading");
  const [message, setMessage] = useState("Loading the document...");
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Most of the gate, not all of it. `document.fullscreenEnabled` is false on
  // iOS Safari, which has no Fullscreen API at all -- the button is hidden
  // there rather than shown and left to fail silently on tap.
  const [fullscreenSupported, setFullscreenSupported] = useState(false);

  useEffect(() => {
    setFullscreenSupported(
      typeof document !== "undefined" && document.fullscreenEnabled === true,
    );
  }, []);

  useEffect(() => {
    function handleFullscreenChange(): void {
      setIsFullscreen(document.fullscreenElement === viewerRef.current);
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    const element = viewerRef.current;
    if (!element) return;

    if (document.fullscreenElement === element) {
      void document.exitFullscreen();
    } else {
      // The whole viewer goes fullscreen, not just the canvas host, so the
      // exit control and any loading/error message stay visible too. The
      // watermark needs no separate handling here: it is already painted
      // into the canvas pixels, so it is on screen in fullscreen exactly
      // because the canvas is.
      void element.requestFullscreen();
    }
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    // Held so the cleanup below can terminate it. PDF.js runs the parse on a
    // Web Worker, and neither the worker nor the document's buffers are
    // released when the component unmounts -- they are owned by the loading
    // task, not by React. Without this, every navigation between documents
    // leaves another worker alive holding a whole PDF in memory. Found with
    // five of them running in devtools.
    let loadingTask: { destroy: () => Promise<void> } | null = null;

    // `host` is passed in rather than read from the ref inside. TypeScript will
    // not carry the null check above into a hoisted function body, and an
    // assertion here would be a claim rather than a check.
    async function render(host: HTMLDivElement): Promise<void> {
      // Imported inside the effect rather than at module scope. A Client
      // Component is still rendered on the server for the initial HTML, and
      // pdfjs-dist reaches for browser globals as it initialises; a top-level
      // import would run that on the server and fail the build.
      const pdfjs = await import("pdfjs-dist");

      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();

      // Fetched in one request, deliberately.
      //
      // PDF.js will happily stream a file with HTTP range requests, but the URL
      // it would be ranging against expires in ten minutes. A reader who leaves
      // the tab open and scrolls to page forty would hit a dead URL halfway
      // through the document. Pulling the bytes once, up front, means the
      // signed URL is used inside a second of being minted and its expiry never
      // interrupts reading.
      const response = await fetch(fileUrl);
      if (!response.ok) {
        throw new Error(
          `The document could not be fetched (HTTP ${response.status}).`,
        );
      }

      const bytes = await response.arrayBuffer();
      if (cancelled) return;

      const task = pdfjs.getDocument({ data: new Uint8Array(bytes) });
      loadingTask = task;
      const pdf = await task.promise;
      if (cancelled) return;

      host.replaceChildren();

      // Pages are rendered one after another rather than in parallel. A hundred
      // simultaneous canvas renders will stall a modest laptop, and the reader
      // can only look at one page at a time anyway.
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        if (cancelled) return;

        setMessage(`Rendering page ${pageNumber} of ${pdf.numPages}...`);

        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1.5 });

        const canvas = document.createElement("canvas");
        canvas.className = "document-page";
        canvas.height = Math.floor(viewport.height);
        canvas.width = Math.floor(viewport.width);

        const context = canvas.getContext("2d");
        if (!context) throw new Error("This browser cannot render a canvas.");

        // pdfjs-dist 6 requires the canvas itself, not only its 2D context.
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        if (cancelled) return;

        // After the page, never before: drawing first would put the document's
        // own content on top of the watermark and hide it.
        drawWatermark(context, canvas.width, canvas.height, watermark);
        host.append(canvas);
      }

      if (!cancelled) setStatus("ready");
    }

    render(host).catch((cause: unknown) => {
      if (cancelled) return;
      setStatus("error");
      setMessage(
        cause instanceof Error
          ? cause.message
          : "The document could not be displayed.",
      );
    });

    return () => {
      cancelled = true;
      // Terminates the worker and frees the document's buffers. It rejects if
      // the task was already destroyed or never finished starting, which is not
      // worth surfacing to a reader who has already navigated away.
      void loadingTask?.destroy().catch(() => {});
    };
  }, [fileUrl, watermark]);

  return (
    <div className="document-viewer" ref={viewerRef}>
      {fullscreenSupported ? (
        <div className="document-viewer__toolbar">
          <Button
            className="document-viewer__fullscreen-toggle"
            onClick={toggleFullscreen}
            variant="secondary"
          >
            {isFullscreen ? "Exit full screen" : "Full screen"}
          </Button>
        </div>
      ) : null}
      {status === "ready" ? null : (
        <p
          aria-live="polite"
          className={status === "error" ? "form-error" : "muted"}
          role={status === "error" ? "alert" : undefined}
        >
          {message}
        </p>
      )}
      <div className="document-pages" ref={hostRef} />
    </div>
  );
}
