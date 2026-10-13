import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";

import { PdfError, readPdf } from "./pdf";

// Real PDFs, built here rather than checked in as binaries, for the same reason
// the Word tests build their zips: a fixture nobody can read in a diff is a
// fixture nobody maintains. The Client's own papers are confidential and never
// enter the repository; they were run through `readPdf` locally instead (see
// docs/context/verification-log.md).

interface FixturePage {
  // Content-stream operators. `/Im1` and `/Logo` are available to draw.
  content: string;
}

// A 2x2 RGB picture: red, green, blue, white.
const pixels = String.fromCharCode(255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255);

function buildPdf(pages: FixturePage[]): Uint8Array {
  const objects: string[] = [];
  const add = (body: string) => {
    objects.push(body);
    return objects.length;
  };
  const stream = (dict: string, data: string) => `<< ${dict} /Length ${data.length} >>\nstream\n${data}\nendstream`;

  const catalog = add("");
  const pagesId = add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const picture = add(stream("/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8", pixels));
  const logo = add(stream("/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8", pixels));
  const kids = pages.map((page) => {
    const content = add(stream("", page.content));
    return add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 300 400] /Contents ${content} 0 R ` +
        `/Resources << /Font << /F1 ${font} 0 R >> /XObject << /Im1 ${picture} 0 R /Logo ${logo} 0 R >> >> >>`,
    );
  });
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((id) => `${id} 0 R`).join(" ")}] /Count ${kids.length} >>`;

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(out.length);
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Uint8Array.from(out, (char) => char.charCodeAt(0));
}

const text = (y: number, value: string) => `BT /F1 12 Tf 20 ${y} Td (${value}) Tj ET\n`;
const draw = (name: string, x: number, y: number, width: number, height: number) =>
  `q ${width} 0 0 ${height} ${x} ${y} cm /${name} Do Q\n`;

describe("readPdf", () => {
  it("returns the text with a marker where the picture sat, and the picture as a PNG", async () => {
    const paper = await readPdf(
      buildPdf([{ content: text(360, "Q1. Study the chart.") + draw("Im1", 20, 200, 120, 120) + text(170, "(a) 1 (b) 2") }]),
      pdfjs,
    );

    expect(paper.text).toBe("Q1. Study the chart.\n[[figure:1]]\n(a) 1 (b) 2");
    expect(paper.figures).toHaveLength(1);
    expect(paper.figures[0]).toMatchObject({ contentType: "image/png", n: 1, note: null });
    expect([...paper.figures[0]!.bytes!.subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
  });

  it("leaves out icons too small to be figures, and logos repeated on every page", async () => {
    const logo = draw("Logo", 250, 370, 30, 20);
    const paper = await readPdf(
      buildPdf([
        { content: logo + text(300, "Q1. First") + draw("Im1", 20, 280, 6, 6) },
        { content: logo + text(300, "Q2. Second") },
        { content: logo + text(300, "Q3. Third") },
      ]),
      pdfjs,
    );

    expect(paper.text).toBe("Q1. First\n\nQ2. Second\n\nQ3. Third");
    expect(paper.figures).toEqual([]);
    expect(paper.notes.join(" ")).toMatch(/One picture repeats on 3 or more pages/);
    expect(paper.notes.join(" ")).toMatch(/One very small picture/);
  });

  it("refuses a PDF with no readable text, as a scan", async () => {
    await expect(readPdf(buildPdf([{ content: draw("Im1", 0, 0, 300, 400) }]), pdfjs)).rejects.toThrow(
      /looks like a scan/,
    );
  });

  it("refuses a file that is not a PDF with a sentence an admin can act on", async () => {
    const error = await readPdf(new TextEncoder().encode("not a pdf at all"), pdfjs).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(PdfError);
    expect((error as PdfError).message).toMatch(/could not be opened as a PDF/);
  });
});
