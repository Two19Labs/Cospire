// A PDF's text in reading order, with `[[figure:N]]` where each picture sat.
//
// Kept apart from `pdf.ts`, which drives PDF.js, so the one decision that is
// easy to get wrong -- where a picture goes in the text -- is a pure function
// with tests of its own.
//
// The text keeps the order PDF.js reads it in, which for the papers this
// imports (exported from Google Docs or Word, one column) is reading order. A
// picture is placed by position instead, because a PDF draws pictures wherever
// its producer likes in the content stream: before the first line that sits
// wholly below it. A line level with a picture -- an option letter beside the
// option's picture -- therefore comes first. PDF coordinates run upwards, so
// "below" is a smaller y.

export interface PdfTextItem {
  // True when PDF.js says a line ends after this item.
  eol: boolean;
  str: string;
  // The baseline, in PDF units from the bottom of the page.
  y: number;
}

export interface PdfPlacedImage {
  // The picture's edges, in the same units as `PdfTextItem.y`.
  bottom: number;
  // Anything the caller needs to find the picture again.
  key: string;
  left: number;
  top: number;
}

export interface PdfPageLayout {
  images: PdfPlacedImage[];
  items: PdfTextItem[];
}

interface Line {
  text: string;
  y: number;
}

function linesOf(items: PdfTextItem[]): Line[] {
  const lines: Line[] = [];
  let parts: string[] = [];
  let y: number | null = null;

  const flush = () => {
    const text = parts.join("").replace(/[ \t ]+/g, " ").trim();
    if (text !== "" && y !== null) lines.push({ text, y });
    parts = [];
    y = null;
  };

  for (const item of items) {
    if (item.str !== "") {
      // A line's height is its first visible item's: an empty item that only
      // carries an end-of-line belongs to the line before it.
      if (y === null && item.str.trim() !== "") y = item.y;
      parts.push(item.str);
    }
    if (item.eol) flush();
  }
  flush();
  return lines;
}

// The whole document. `figureKeys[N - 1]` is the picture behind
// `[[figure:N]]`, so numbering follows the order the markers appear in.
export function layoutPdfText(pages: PdfPageLayout[]): { figureKeys: string[]; text: string } {
  const figureKeys: string[] = [];
  const pageTexts: string[] = [];

  for (const page of pages) {
    const lines = linesOf(page.items);
    // Highest picture first, and left to right along a row, so pictures above
    // the same line keep the order they are read in.
    const pending = [...page.images].sort((a, b) => b.top - a.top || a.left - b.left);
    const out: string[] = [];

    const place = (image: PdfPlacedImage) => {
      figureKeys.push(image.key);
      out.push(`[[figure:${figureKeys.length}]]`);
    };

    for (const line of lines) {
      while (pending.length > 0 && pending[0]!.bottom > line.y) place(pending.shift()!);
      out.push(line.text);
    }
    for (const image of pending) place(image);

    if (out.length > 0) pageTexts.push(out.join("\n"));
  }

  return { figureKeys, text: pageTexts.join("\n\n") };
}
