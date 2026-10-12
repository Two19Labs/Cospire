"use client";

import { useState } from "react";

import { createBrowserSupabaseClient } from "@/shared/db/supabase/browser";

import { type DocxPaper, DocxError, readDocx } from "../docx";
import { PdfError, readPdf } from "../pdf";
import { buildQuestionImagePath, questionImagesBucket } from "../storage";

// Step 1 of the import: open a Word file or a PDF, put its pictures in the
// bucket, and hand back the paper's text with `[[figure:N]]` where each one sat.
// The two readers return the same shape, so nothing after this knows which it
// was.
//
// **It runs in the browser, and that is deliberate.** Every upload in this
// project goes from the browser straight to Storage under the author's own
// session, so the Storage policies decide and no file passes through the
// application server (operating manual §8). Sending a 12 MB Word file to a
// Server Action instead would proxy media through a Vercel function, whose
// request body is capped at 1 MB by default and 4.5 MB by the platform -- the
// High finding in CONTEXT.md about payload limits, met head on.
//
// So this needs JavaScript, the same trade the image field and the document
// upload already make. Without it the paste box below still works; there is
// simply no Word step.
//
// What the server is handed afterwards is text plus a list of "N:path" pairs,
// and it trusts neither: `readFigurePaths` re-checks every path.

export interface ExtractedPaper {
  documentName: string;
  // Every figure the document held, exportable or not. `figurePaths` holds only
  // the ones that came out, so the two together say what was left behind.
  figureCount: number;
  // Figure number to the object path it was stored at. Numbers whose picture
  // could not be exported are absent, on purpose: the marker stays in the text
  // and the admin is told to paste that one in.
  figurePaths: Record<number, string>;
  notes: string[];
  text: string;
}

// A file larger than this is not a question paper, and reading one in the
// browser would hang the tab before it failed.
const maxPaperBytes = 25 * 1024 * 1024;

// PDF.js, loaded only when a PDF is chosen and only in the browser: it reaches
// for browser globals as it initialises, as the document viewer notes.
async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  return pdfjs;
}

export function WordUploadField({
  onExtracted,
  orgId,
}: {
  onExtracted: (paper: ExtractedPaper | null) => void;
  orgId: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Uploaded by a previous run in this sitting. Nothing points at them once a
  // new document replaces them, and left alone they would sit in the bucket for
  // ever against the 1GB Free-plan budget (operating manual §4.6).
  const [previous, setPrevious] = useState<string[]>([]);

  async function open(file: File) {
    setError(null);
    onExtracted(null);

    const isPdf = /\.pdf$/i.test(file.name);
    if (!isPdf && !/\.docx$/i.test(file.name)) {
      setError("That is not a .docx or .pdf file. Save the paper from Word as .docx, or export it as a PDF.");
      return;
    }
    if (file.size > maxPaperBytes) {
      setError("That file is larger than 25 MB. Split the paper and import it in parts.");
      return;
    }

    setBusy(true);
    try {
      const supabase = createBrowserSupabaseClient();

      if (previous.length > 0) {
        await supabase.storage.from(questionImagesBucket).remove(previous);
        setPrevious([]);
      }

      let paper: DocxPaper;
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        paper = isPdf ? await readPdf(bytes, await loadPdfJs()) : readDocx(bytes);
      } catch (cause) {
        setError(
          cause instanceof DocxError || cause instanceof PdfError
            ? cause.message
            : `That ${isPdf ? "PDF" : "Word file"} could not be read.`,
        );
        return;
      }

      const figurePaths: Record<number, string> = {};
      const notes = [...paper.notes];
      const stored: string[] = [];
      const failed: number[] = [];

      for (const figure of paper.figures) {
        if (!figure.bytes || !figure.contentType) continue;
        const path = buildQuestionImagePath({
          objectId: crypto.randomUUID(),
          orgId,
          type: figure.contentType,
        });
        // A Uint8Array from the zip, not the File: the picture is one entry
        // inside it, so there is nothing else to upload.
        const upload = () =>
          supabase.storage
            .from(questionImagesBucket)
            .upload(path, new Blob([new Uint8Array(figure.bytes!)], { type: figure.contentType! }), {
              contentType: figure.contentType!,
              upsert: false,
            });
        // Tried twice. A paper with twenty pictures is twenty requests in a
        // row, and one dropped connection among them is common enough on a
        // real network (seen locally against the hosted project) that it
        // should not cost the admin a hand-pasted figure.
        let { error: uploadError } = await upload();
        if (uploadError) {
          ({ error: uploadError } = await upload());
          // The first attempt can land before its connection drops, and then
          // the second finds the picture already there.
          if (uploadError && /already exists/i.test(uploadError.message)) uploadError = null;
        }
        if (uploadError) {
          failed.push(figure.n);
          continue;
        }
        figurePaths[figure.n] = path;
        stored.push(path);
      }

      if (failed.length > 0) {
        notes.push(
          `${failed.length === 1 ? `Figure ${failed[0]}` : `Figures ${failed.join(", ")}`} could not be uploaded. Paste ${failed.length === 1 ? "it" : "them"} in on the review screen.`,
        );
      }

      setPrevious(stored);
      onExtracted({
        documentName: file.name.replace(/\.(docx|pdf)$/i, "").replace(/[\s_]+/g, " ").trim().slice(0, 200),
        figureCount: paper.figures.length,
        figurePaths,
        notes,
        text: paper.text,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field">
      <label className="button button--secondary button--compact">
        {busy ? "Opening…" : "Choose a Word file or PDF"}
        <input
          accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="visually-hidden"
          disabled={busy}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void open(file);
          }}
          type="file"
        />
      </label>
      <span className="field__hint">
        A .docx saved from Word, or a PDF that is not a scan, up to 25 MB. The
        pictures are taken out here and the text below comes back with a numbered
        marker where each one sat. A long PDF full of pictures can take a few
        seconds.
      </span>
      {busy ? (
        <span aria-live="polite" className="muted">
          Reading the document and uploading its pictures…
        </span>
      ) : null}
      {error ? (
        <span className="field__error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
