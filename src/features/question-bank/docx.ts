// Opening a `.docx` and getting back the paper's text plus its pictures.
//
// A `.docx` is a zip. `fflate` opens it -- the one dependency the owner approved
// for this on 2026-09-23 -- because Node cannot open a zip on its own and a
// hand-written zip reader is the kind of code that works on one file and fails
// on the next.
//
// **Nothing here is guessed at.** A picture Word stores as a PNG or a JPEG comes
// out as bytes and gets a number. A picture Word stores as an EMF or WMF
// drawing, a native Word chart, and an embedded object are each *counted* and
// *flagged*, never converted: rendering vector art or a live chart would need a
// renderer this project has no business carrying, and a wrong figure on a
// question paper is worse than a missing one an admin is told about.
//
// The text comes back with `[[figure:N]]` where each of those sat, numbered in
// document order, whether or not there is an image behind N. `import-spec.ts`
// reads those markers back off the model's JSON and `import-actions.ts` turns
// each number into an image path.

import { unzipSync } from "fflate";

import { readDocxBody, readRelationships, type DocxFigureRef } from "./docx-text";
import { questionImageMaxBytes } from "./storage";

// A picture that can be uploaded, or one that cannot and why.
export interface DocxFigure {
  bytes: Uint8Array | null;
  // Set only when `bytes` is set, and always one the bucket accepts.
  contentType: string | null;
  n: number;
  // Why it cannot be uploaded. Null when it can.
  note: string | null;
}

export interface DocxPaper {
  figures: DocxFigure[];
  // Things the admin should know about the document as a whole.
  notes: string[];
  text: string;
}

export class DocxError extends Error {}

// Only what the `question-images` bucket accepts. Anything else is flagged
// rather than uploaded, because the bucket would refuse it anyway and a refusal
// at upload time is a worse place to find out.
const uploadableTypes: Record<string, string> = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

// Word's vector formats. Converting one needs a renderer; `.emz` and `.wmz` are
// the gzipped forms of the same thing.
const vectorTypes = new Set(["emf", "emz", "wmf", "wmz"]);

// A zip entry's path is relative to `word/`, and Word writes `media/image1.png`
// or occasionally `../media/image1.png`. Anything that climbs out of the archive
// is refused rather than normalised.
function resolveTarget(target: string): string | null {
  const cleaned = target.replace(/\\/g, "/").replace(/^\/+/, "");
  const parts: string[] = [];
  for (const segment of `word/${cleaned}`.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return parts.length > 0 ? parts.join("/") : null;
}

function classify(
  ref: DocxFigureRef,
  rels: Record<string, string>,
  entries: Record<string, Uint8Array>,
): DocxFigure {
  const base = { bytes: null, contentType: null, n: ref.n };

  if (ref.source === "chart") {
    return { ...base, note: "a Word chart drawn from live data, which has no picture to export" };
  }
  if (ref.source === "object") {
    return { ...base, note: "an embedded object, such as an equation or a spreadsheet" };
  }
  if (!ref.relId) {
    return { ...base, note: "a drawing with no picture file behind it, such as a Word shape or text box" };
  }

  const target = rels[ref.relId];
  if (!target) return { ...base, note: "a picture whose file is missing from the document" };

  const path = resolveTarget(target);
  const bytes = path ? entries[path] : undefined;
  if (!path || !bytes) return { ...base, note: "a picture whose file is missing from the document" };

  const extension = (path.split(".").pop() ?? "").toLowerCase();

  if (vectorTypes.has(extension)) {
    return { ...base, note: `a Word drawing (${extension.toUpperCase()}), which is vector art, not a picture` };
  }

  const contentType = uploadableTypes[extension];
  if (!contentType) {
    return { ...base, note: `a ${extension.toUpperCase() || "picture"} file, which is not a format the bank accepts` };
  }

  if (bytes.byteLength > questionImageMaxBytes) {
    return { ...base, note: "a picture larger than the 5 MB an image may be" };
  }
  if (bytes.byteLength === 0) {
    return { ...base, note: "an empty picture file" };
  }

  return { bytes, contentType, n: ref.n, note: null };
}

// The whole document. Throws `DocxError` with a sentence an admin can act on;
// everything else it finds becomes a note rather than a failure, because a
// paper with one unreadable picture is still worth importing.
export function readDocx(file: Uint8Array): DocxPaper {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(file);
  } catch {
    throw new DocxError(
      "That file could not be opened as a Word document. Save it from Word as .docx — an older .doc, a PDF or a password-protected file cannot be read here.",
    );
  }

  const documentXml = entries["word/document.xml"];
  if (!documentXml) {
    throw new DocxError(
      "That is a zip file but not a Word document: it has no word/document.xml. Save it from Word as .docx.",
    );
  }

  const decoder = new TextDecoder();
  const body = readDocxBody(decoder.decode(documentXml));
  const relsEntry = entries["word/_rels/document.xml.rels"];
  const rels = relsEntry ? readRelationships(decoder.decode(relsEntry)) : {};

  const figures = body.figures.map((ref) => classify(ref, rels, entries));

  const notes: string[] = [];
  if (body.text === "" && figures.length === 0) {
    throw new DocxError(
      "That document has no text and no pictures in it. Check it is the right file, and that the questions are not inside a picture of a scan.",
    );
  }
  if (body.usesAutoNumbering) {
    notes.push(
      "This document numbers its questions with Word's automatic numbering, which is not stored in the text. The numbers are missing below; the model is told to keep the questions in order.",
    );
  }
  const unusable = figures.filter((figure) => figure.note !== null);
  if (unusable.length > 0) {
    notes.push(
      `${unusable.length === 1 ? "One figure" : `${unusable.length} figures`} could not be taken out of the document and must be pasted in by hand on the review screen: ` +
        unusable.map((figure) => `figure ${figure.n} is ${figure.note}`).join("; ") +
        ".",
    );
  }

  return { figures, notes, text: body.text };
}
