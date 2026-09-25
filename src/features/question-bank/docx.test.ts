import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { DocxError, readDocx } from "./docx";
import { questionImageMaxBytes } from "./storage";

// Real zips, built here rather than checked in as a binary: a fixture nobody can
// read in a diff is a fixture nobody maintains, and `zipSync` is the same
// library that has to open it again.

const encoder = new TextEncoder();

const documentXml = (inner: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
  `<w:body>${inner}</w:body></w:document>`;

const text = (value: string) => `<w:p><w:r><w:t>${value}</w:t></w:r></w:p>`;
const picture = (id: string) =>
  `<w:p><w:r><w:drawing><wp:inline><a:graphic><a:graphicData>` +
  `<pic:pic><pic:blipFill><a:blip r:embed="${id}"/></pic:blipFill></pic:pic>` +
  `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;

const relationships = (entries: [string, string][]) =>
  `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  entries.map(([id, target]) => `<Relationship Id="${id}" Target="${target}"/>`).join("") +
  `</Relationships>`;

// A PNG's first eight bytes. Nothing here decodes an image, so the signature is
// as much of one as the test needs.
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function buildDocx({
  body,
  media = {},
  rels = [],
}: {
  body: string;
  media?: Record<string, Uint8Array>;
  rels?: [string, string][];
}): Uint8Array {
  return zipSync({
    "[Content_Types].xml": encoder.encode(`<?xml version="1.0"?><Types/>`),
    "word/_rels/document.xml.rels": encoder.encode(relationships(rels)),
    "word/document.xml": encoder.encode(documentXml(body)),
    ...media,
  });
}

describe("readDocx", () => {
  it("gives back the text with a numbered marker and the picture's bytes", () => {
    const file = buildDocx({
      body: text("Q1. Study the chart.") + picture("rId4") + text("Q2. And this one?"),
      media: { "word/media/image1.png": png },
      rels: [["rId4", "media/image1.png"]],
    });

    const paper = readDocx(file);
    expect(paper.text).toBe("Q1. Study the chart.\n[[figure:1]]\nQ2. And this one?");
    expect(paper.notes).toEqual([]);
    expect(paper.figures).toHaveLength(1);
    expect(paper.figures[0].n).toBe(1);
    expect(paper.figures[0].contentType).toBe("image/png");
    expect(paper.figures[0].note).toBeNull();
    expect(Array.from(paper.figures[0].bytes ?? [])).toEqual(Array.from(png));
  });

  it("numbers every figure in document order, exportable or not", () => {
    const file = buildDocx({
      body: picture("rId4") + picture("rId5") + picture("rId6"),
      media: {
        "word/media/image1.emf": encoder.encode("vector"),
        "word/media/image2.png": png,
        "word/media/image3.jpeg": png,
      },
      rels: [
        ["rId4", "media/image1.emf"],
        ["rId5", "media/image2.png"],
        ["rId6", "media/image3.jpeg"],
      ],
    });

    const paper = readDocx(file);
    expect(paper.text).toBe("[[figure:1]]\n[[figure:2]]\n[[figure:3]]");
    expect(paper.figures.map((figure) => figure.n)).toEqual([1, 2, 3]);
    // The numbering does not close up over the one that cannot be exported: the
    // marker for it is still in the text, so its number must still mean it.
    expect(paper.figures[0].bytes).toBeNull();
    expect(paper.figures[0].note).toMatch(/Word drawing \(EMF\)/);
    expect(paper.figures[1].contentType).toBe("image/png");
    expect(paper.figures[2].contentType).toBe("image/jpeg");
  });

  it("flags a Word drawing, a native chart and an embedded object rather than guessing", () => {
    const body =
      picture("rId4") +
      `<w:p><w:r><w:drawing><a:graphicData><c:chart r:id="rId5"/></a:graphicData></w:drawing></w:r></w:p>` +
      `<w:p><w:r><w:object><v:shape><v:imagedata r:id="rId6"/></v:shape></w:object></w:r></w:p>`;
    const file = buildDocx({
      body,
      media: { "word/media/image1.wmf": encoder.encode("vector") },
      rels: [
        ["rId4", "media/image1.wmf"],
        ["rId5", "charts/chart1.xml"],
        ["rId6", "embeddings/oleObject1.bin"],
      ],
    });

    const paper = readDocx(file);
    expect(paper.figures.every((figure) => figure.bytes === null)).toBe(true);
    expect(paper.figures.map((figure) => figure.note)).toEqual([
      expect.stringMatching(/Word drawing \(WMF\)/),
      expect.stringMatching(/chart drawn from live data/),
      expect.stringMatching(/embedded object/),
    ]);
    expect(paper.notes[0]).toMatch(/^3 figures could not be taken out of the document/);
  });

  it("refuses a picture larger than the bucket allows, and an empty one", () => {
    const file = buildDocx({
      body: picture("rId4") + picture("rId5"),
      media: {
        "word/media/big.png": new Uint8Array(questionImageMaxBytes + 1),
        "word/media/empty.png": new Uint8Array(0),
      },
      rels: [
        ["rId4", "media/big.png"],
        ["rId5", "media/empty.png"],
      ],
    });

    const paper = readDocx(file);
    expect(paper.figures[0].note).toMatch(/larger than the 5 MB/);
    expect(paper.figures[1].note).toMatch(/empty picture file/);
  });

  it("flags a format the bank does not accept rather than uploading it", () => {
    const file = buildDocx({
      body: picture("rId4"),
      media: { "word/media/image1.tiff": png },
      rels: [["rId4", "media/image1.tiff"]],
    });
    expect(readDocx(file).figures[0].note).toMatch(/TIFF file, which is not a format the bank accepts/);
  });

  it("resolves a target written relative to the document, and refuses one that climbs out", () => {
    const inside = buildDocx({
      body: picture("rId4"),
      media: { "word/media/image1.png": png },
      rels: [["rId4", "../word/media/image1.png"]],
    });
    expect(readDocx(inside).figures[0].contentType).toBe("image/png");

    const outside = buildDocx({
      body: picture("rId4"),
      media: { "word/media/image1.png": png },
      rels: [["rId4", "../../../etc/passwd"]],
    });
    expect(readDocx(outside).figures[0].bytes).toBeNull();
    expect(readDocx(outside).figures[0].note).toMatch(/missing from the document/);
  });

  it("notes a picture whose relationship is not in the document at all", () => {
    const file = buildDocx({ body: picture("rId99"), media: { "word/media/image1.png": png } });
    expect(readDocx(file).figures[0].note).toMatch(/missing from the document/);
  });

  it("says when the questions are numbered by Word rather than typed", () => {
    const file = buildDocx({
      body: `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>Solve for x.</w:t></w:r></w:p>`,
    });
    expect(readDocx(file).notes[0]).toMatch(/automatic numbering/);
  });

  it("refuses a file that is not a zip", () => {
    expect(() => readDocx(encoder.encode("%PDF-1.7 this is not a docx"))).toThrow(DocxError);
    expect(() => readDocx(encoder.encode("%PDF-1.7"))).toThrow(/Save it from Word as .docx/);
  });

  it("refuses a zip that is not a Word document", () => {
    const file = zipSync({ "notes.txt": encoder.encode("hello") });
    expect(() => readDocx(file)).toThrow(/no word\/document\.xml/);
  });

  it("refuses a document with neither text nor pictures", () => {
    expect(() => readDocx(buildDocx({ body: "" }))).toThrow(/no text and no pictures/);
  });

  it("reads a document that has pictures but no text", () => {
    const file = buildDocx({
      body: picture("rId4"),
      media: { "word/media/image1.png": png },
      rels: [["rId4", "media/image1.png"]],
    });
    expect(readDocx(file).text).toBe("[[figure:1]]");
  });
});
