// Opening a PDF and getting back the paper's text plus its pictures, in the
// same shape `readDocx` returns, so everything after the upload is shared.
//
// **Best effort, as the agreement says** (Annexure B excludes guaranteed figure
// extraction from PDFs). What comes out reliably is what a PDF stores as a
// picture: a chart or diagram pasted in as an image, which is how the Client's
// papers carry them. What does not come out is a chart the PDF *draws* with
// lines and shapes, because there is no picture to take; nothing here renders
// pages. The admin is told, and pastes that one in on the review screen.
//
// A scanned PDF has no text to read at all and is refused with a sentence that
// says so, rather than imported as a paper of empty questions.
//
// PDF.js is passed in rather than imported, because the browser loads the
// standard build with its worker and Node (the tests) loads the legacy build.

import type { DocxFigure, DocxPaper } from "./docx";
import { type PdfPageLayout, type PdfPlacedImage, type PdfTextItem, layoutPdfText } from "./pdf-text";
import { encodePng } from "./png";
import { questionImageMaxBytes } from "./storage";

export class PdfError extends Error {}

// The parts of PDF.js this uses. Both builds satisfy it.
export type PdfJs = Pick<typeof import("pdfjs-dist"), "getDocument" | "OPS">;

interface DecodedImage {
  data?: Uint8Array | Uint8ClampedArray;
  height: number;
  kind?: number;
  width: number;
}

type Matrix = [number, number, number, number, number, number];

const identity: Matrix = [1, 0, 0, 1, 0, 0];

// `m` applied first, then `ctm`: the order PDF's `cm` operator composes in.
function multiply(ctm: Matrix, m: Matrix): Matrix {
  const [a, b, c, d, e, f] = ctm;
  return [
    m[0] * a + m[1] * c,
    m[0] * b + m[1] * d,
    m[2] * a + m[3] * c,
    m[2] * b + m[3] * d,
    m[4] * a + m[5] * c + e,
    m[4] * b + m[5] * d + f,
  ];
}

// A picture is drawn into the unit square under the current transform.
function box(ctm: Matrix) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [x, y] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ] as const) {
    xs.push(ctm[0] * x + ctm[2] * y + ctm[4]);
    ys.push(ctm[1] * x + ctm[3] * y + ctm[5]);
  }
  return {
    bottom: Math.min(...ys),
    height: Math.max(...ys) - Math.min(...ys),
    left: Math.min(...xs),
    top: Math.max(...ys),
    width: Math.max(...xs) - Math.min(...xs),
  };
}

// Smaller than this on the page, in points (1/72 inch), a picture is a bullet,
// an icon or a rule, not a figure a question needs.
const minFigurePoints = 12;
// Drawn on this many pages or more, a picture is a logo or a background.
const repeatedOnPages = 3;
// The same limit the Word upload has.
const maxPdfPages = 200;

interface Drawn {
  image: DecodedImage | null;
  key: string;
  // Same pixels, same fingerprint, wherever the picture is drawn.
  fingerprint: string | null;
  page: number;
  top: number;
}

// FNV-1a over the pixels, with the size, so two pictures match only when they
// are the same picture.
function fingerprint(image: DecodedImage | null): string | null {
  if (!image?.data) return null;
  let hash = 0x811c9dc5;
  for (const byte of image.data) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  return `${image.width}x${image.height}:${image.kind ?? 0}:${hash}`;
}

function isMatrix(value: unknown): value is Matrix {
  return Array.isArray(value) && value.length === 6 && value.every((n) => typeof n === "number");
}

export async function readPdf(file: Uint8Array, pdfjs: PdfJs): Promise<DocxPaper> {
  const task = pdfjs.getDocument({
    // A copy: PDF.js transfers the buffer to its worker and empties the original.
    data: file.slice(),
    // Pictures as plain pixels rather than browser bitmaps, so the same code
    // runs in Node and in the browser and every picture can be encoded.
    isImageDecoderSupported: false,
    isOffscreenCanvasSupported: false,
    verbosity: 0,
  });

  try {
    let document;
    try {
      document = await task.promise;
    } catch (cause) {
      const name = cause instanceof Error ? cause.name : "";
      throw new PdfError(
        name === "PasswordException"
          ? "That PDF is password-protected. Save an unprotected copy and upload that."
          : "That file could not be opened as a PDF. Check it is the right file, or export the paper again as PDF or Word.",
      );
    }

    if (document.numPages > maxPdfPages) {
      throw new PdfError(`That PDF has ${document.numPages} pages. Split the paper and import it in parts of up to ${maxPdfPages}.`);
    }

    const { OPS } = pdfjs;
    const layouts: PdfPageLayout[] = [];
    const drawn: Drawn[] = [];
    let skippedSmall = 0;
    let textLength = 0;
    const scannedPages: number[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const items: PdfTextItem[] = [];
      for (const item of content.items) {
        if (!("str" in item)) continue;
        items.push({ eol: item.hasEOL, str: item.str, y: item.transform[5] ?? 0 });
        textLength += item.str.trim().length;
      }

      const operators = await page.getOperatorList();
      const stack: Matrix[] = [];
      let ctm: Matrix = identity;
      const images: PdfPlacedImage[] = [];
      const pageArea = page.view[2]! * page.view[3]!;
      let pageTextLength = 0;
      for (const item of items) pageTextLength += item.str.trim().length;

      for (let i = 0; i < operators.fnArray.length; i += 1) {
        const fn = operators.fnArray[i];
        const args = operators.argsArray[i] as unknown[] | null;

        if (fn === OPS.save) stack.push(ctm);
        else if (fn === OPS.restore) ctm = stack.pop() ?? identity;
        else if (fn === OPS.transform && args && isMatrix(args)) ctm = multiply(ctm, args);
        else if (fn === OPS.paintFormXObjectBegin) {
          stack.push(ctm);
          if (args && isMatrix(args[0])) ctm = multiply(ctm, args[0]);
        } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? identity;
        else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
          const placed = box(ctm);
          if (placed.width < minFigurePoints || placed.height < minFigurePoints) {
            skippedSmall += 1;
            continue;
          }
          if (placed.width * placed.height > pageArea * 0.85 && pageTextLength < 50) scannedPages.push(pageNumber);

          const key = `${pageNumber}:${i}`;
          let image: DecodedImage | null = null;
          if (fn === OPS.paintInlineImageXObject) {
            image = (args?.[0] as DecodedImage | undefined) ?? null;
          } else if (typeof args?.[0] === "string") {
            const objectId = args[0];
            const store = objectId.startsWith("g_") ? page.commonObjs : page.objs;
            image = (await new Promise<unknown>((resolve) => store.get(objectId, resolve))) as DecodedImage | null;
          }
          drawn.push({ fingerprint: fingerprint(image), image, key, page: pageNumber, top: placed.top });
          images.push({ bottom: placed.bottom, key, left: placed.left, top: placed.top });
        }
      }

      layouts.push({ images, items });
      page.cleanup();
    }

    if (textLength < 20) {
      throw new PdfError(
        "That PDF has no text in it that can be read: it looks like a scan or a set of photographs. Use the Word file the paper was written in, or paste the questions in.",
      );
    }

    // A picture drawn on many pages is the paper's logo or background. Its
    // markers would sit at the top of every page and mean nothing. PDF.js names
    // a picture per page, so the same logo arrives under a new name each time:
    // repeats are found by their pixels instead.
    const pagesByPrint = new Map<string, Set<number>>();
    for (const item of drawn) {
      if (!item.fingerprint) continue;
      const pages = pagesByPrint.get(item.fingerprint) ?? new Set<number>();
      pages.add(item.page);
      pagesByPrint.set(item.fingerprint, pages);
    }
    const decorative = new Set(
      [...pagesByPrint.entries()].filter(([, pages]) => pages.size >= repeatedOnPages).map(([print]) => print),
    );
    const kept = new Set(
      drawn.filter((item) => !item.fingerprint || !decorative.has(item.fingerprint)).map((item) => item.key),
    );
    for (const layout of layouts) layout.images = layout.images.filter((image) => kept.has(image.key));

    const { figureKeys, text } = layoutPdfText(layouts);
    const byKey = new Map(drawn.map((item) => [item.key, item]));

    const figures: DocxFigure[] = figureKeys.map((key, index) => {
      const n = index + 1;
      const base = { bytes: null, contentType: null, n };
      const image = byKey.get(key)?.image;
      if (!image?.data) return { ...base, note: "a picture PDF.js could not decode" };
      const bytes = encodePng({ data: image.data, height: image.height, kind: image.kind ?? 0, width: image.width });
      if (!bytes) return { ...base, note: "a picture in a colour format the importer cannot convert" };
      if (bytes.byteLength > questionImageMaxBytes) return { ...base, note: "a picture larger than the 5 MB an image may be" };
      return { bytes, contentType: "image/png", n, note: null };
    });

    const notes: string[] = [
      "Read from a PDF. A chart the PDF draws with lines and shapes, rather than stores as a picture, has no marker below: check each picture question on the review screen.",
    ];
    if (scannedPages.length > 0) {
      notes.push(
        `${scannedPages.length === 1 ? `Page ${scannedPages[0]} looks` : `Pages ${scannedPages.join(", ")} look`} scanned: the page came out as one picture and its words cannot be read.`,
      );
    }
    if (decorative.size > 0) {
      notes.push(
        `${decorative.size === 1 ? "One picture repeats" : `${decorative.size} pictures repeat`} on ${repeatedOnPages} or more pages and ${decorative.size === 1 ? "was" : "were"} left out as a logo or background.`,
      );
    }
    if (skippedSmall > 0) {
      notes.push(`${skippedSmall === 1 ? "One very small picture was" : `${skippedSmall} very small pictures were`} left out as icons or rules.`);
    }
    const unusable = figures.filter((figure) => figure.note !== null);
    if (unusable.length > 0) {
      notes.push(
        `${unusable.length === 1 ? "One figure" : `${unusable.length} figures`} could not be taken out of the PDF and must be pasted in by hand on the review screen: ` +
          unusable.map((figure) => `figure ${figure.n} is ${figure.note}`).join("; ") +
          ".",
      );
    }

    return { figures, notes, text };
  } finally {
    await task.destroy();
  }
}
