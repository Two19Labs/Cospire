"use client";

import { useState } from "react";

import { createBrowserSupabaseClient } from "@/shared/db/supabase/browser";

import { DocxError, readDocx } from "../docx";
import { buildQuestionImagePath, questionImagesBucket } from "../storage";

// Step 1 of the Word import: open the document, put its pictures in the bucket,
// and hand back the paper's text with `[[figure:N]]` where each one sat.
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

// A Word file larger than this is not a question paper, and reading one in the
// browser would hang the tab before it failed.
const maxDocxBytes = 25 * 1024 * 1024;

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

    if (!/\.docx$/i.test(file.name)) {
      setError("That is not a .docx file. Open it in Word and use File → Save As → Word Document (.docx).");
      return;
    }
    if (file.size > maxDocxBytes) {
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

      let paper;
      try {
        paper = readDocx(new Uint8Array(await file.arrayBuffer()));
      } catch (cause) {
        setError(cause instanceof DocxError ? cause.message : "That Word file could not be read.");
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
        const { error: uploadError } = await supabase.storage
          .from(questionImagesBucket)
          .upload(path, new Blob([new Uint8Array(figure.bytes)], { type: figure.contentType }), {
            contentType: figure.contentType,
            upsert: false,
          });
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
        documentName: file.name.replace(/\.docx$/i, "").replace(/[\s_]+/g, " ").trim().slice(0, 200),
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
        {busy ? "Opening…" : "Choose a Word file"}
        <input
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
        A .docx saved from Word, up to 25 MB. The pictures are taken out here and
        the text below comes back with a numbered marker where each one sat.
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
