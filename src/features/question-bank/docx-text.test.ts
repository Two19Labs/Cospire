import { describe, expect, it } from "vitest";

import { readDocxBody, readRelationships } from "./docx-text";

// Fragments of `word/document.xml` as Word really writes it, cut down to the
// element under test. Every case here is a way a question paper has been seen to
// go wrong somewhere, not a hypothetical: tracked changes left on, a picture
// written twice for older readers, a table of data, a chart that is not a
// picture at all.

const body = (inner: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
  `<w:body>${inner}</w:body></w:document>`;

const para = (inner: string) => `<w:p>${inner}</w:p>`;
const run = (text: string) => `<w:r><w:rPr><w:b/></w:rPr><w:t>${text}</w:t></w:r>`;
const blip = (id: string) =>
  `<w:r><w:drawing><wp:inline><a:graphic><a:graphicData>` +
  `<pic:pic><pic:blipFill><a:blip r:embed="${id}"/></pic:blipFill></pic:pic>` +
  `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;

describe("readDocxBody", () => {
  it("makes one line per paragraph and joins the runs in it", () => {
    const { text } = readDocxBody(body(para(run("Q1. ") + run("What is 2 + 2?")) + para(run("Q2. And 3 + 3?"))));
    expect(text).toBe("Q1. What is 2 + 2?\nQ2. And 3 + 3?");
  });

  it("takes no text from between the tags, so a reformatted file is not indented", () => {
    const xml = body(`\n  <w:p>\n    <w:r>\n      <w:t>Q1. Two words</w:t>\n    </w:r>\n  </w:p>\n`);
    expect(readDocxBody(xml).text).toBe("Q1. Two words");
  });

  it("keeps a line break and a tab, and decodes entities", () => {
    const { text } = readDocxBody(
      body(para(`<w:r><w:t>a &lt; b</w:t><w:br/><w:t>x</w:t><w:tab/><w:t>&#8804; y &amp; z</w:t></w:r>`)),
    );
    expect(text).toBe("a < b\nx\t≤ y & z");
  });

  it("keeps the spaces in a run marked xml:space=preserve", () => {
    const { text } = readDocxBody(body(para(`<w:r><w:t xml:space="preserve">Q1. </w:t></w:r><w:r><w:t>Solve</w:t></w:r>`)));
    expect(text).toBe("Q1. Solve");
  });

  it("renders a table as a text table, padding short rows", () => {
    const cell = (value: string) => `<w:tc><w:tcPr/>${para(run(value))}</w:tc>`;
    const xml = body(
      `<w:tbl><w:tblPr/>` +
        `<w:tr>${cell("Store")}${cell("Q1")}${cell("Q2")}</w:tr>` +
        `<w:tr>${cell("A")}${cell("12")}</w:tr>` +
        `</w:tbl>`,
    );
    expect(readDocxBody(xml).text).toBe("| Store | Q1 | Q2 |\n| A | 12 |  |");
  });

  it("nests a table inside a cell rather than flattening it into the page", () => {
    const cell = (inner: string) => `<w:tc>${inner}</w:tc>`;
    const inner = `<w:tbl><w:tr>${cell(para(run("x")))}${cell(para(run("y")))}</w:tr></w:tbl>`;
    const xml = body(`<w:tbl><w:tr>${cell(inner)}${cell(para(run("outer")))}</w:tr></w:tbl>`);
    expect(readDocxBody(xml).text).toBe("| \\| x \\| y \\| | outer |".replace(/\\/g, ""));
  });

  it("numbers a picture and leaves its marker where the picture sat", () => {
    const { figures, text } = readDocxBody(body(para(run("Study the chart below.") + blip("rId7"))));
    expect(text).toBe("Study the chart below.[[figure:1]]");
    expect(figures).toEqual([{ n: 1, relId: "rId7", source: "drawing" }]);
  });

  it("counts a picture written twice for older readers only once", () => {
    // Word writes the modern drawing under mc:Choice and a VML copy of the same
    // picture under mc:Fallback. Taking both reports two figures for one image.
    const xml = body(
      para(
        `<mc:AlternateContent>` +
          `<mc:Choice Requires="wpg">${blip("rId4")}</mc:Choice>` +
          `<mc:Fallback><w:r><w:pict><v:shape><v:imagedata r:id="rId5"/></v:shape></w:pict></w:r></mc:Fallback>` +
          `</mc:AlternateContent>`,
      ),
    );
    const { figures, text } = readDocxBody(xml);
    expect(figures).toEqual([{ n: 1, relId: "rId4", source: "drawing" }]);
    expect(text).toBe("[[figure:1]]");
  });

  it("tells a chart and a legacy drawing apart from a picture", () => {
    const xml = body(
      para(`<w:r><w:drawing><a:graphicData><c:chart r:id="rId9"/></a:graphicData></w:drawing></w:r>`) +
        para(`<w:r><w:pict><v:shape><v:imagedata r:id="rId10"/></v:shape></w:pict></w:r>`) +
        para(`<w:r><w:object><v:shape><v:imagedata r:id="rId11"/></v:shape></w:object></w:r>`),
    );
    expect(readDocxBody(xml).figures).toEqual([
      { n: 1, relId: "rId9", source: "chart" },
      { n: 2, relId: "rId10", source: "pict" },
      { n: 3, relId: "rId11", source: "object" },
    ]);
  });

  it("still counts a drawing that names no picture file, such as a text box", () => {
    const xml = body(para(`<w:r><w:drawing><wp:inline><a:graphic/></wp:inline></w:drawing></w:r>`));
    expect(readDocxBody(xml).figures).toEqual([{ n: 1, relId: null, source: "drawing" }]);
  });

  it("leaves out text deleted with track changes on, and field codes", () => {
    const xml = body(
      para(
        run("Kept.") +
          `<w:del><w:r><w:delText>Deleted.</w:delText></w:r></w:del>` +
          `<w:r><w:instrText>PAGE \\* MERGEFORMAT</w:instrText></w:r>` +
          run(" Also kept."),
      ),
    );
    expect(readDocxBody(xml).text).toBe("Kept. Also kept.");
  });

  it("does not take a picture out of a deleted paragraph", () => {
    const xml = body(para(`<w:del>${blip("rId4")}</w:del>` + run("Kept.")));
    const { figures, text } = readDocxBody(xml);
    expect(figures).toEqual([]);
    expect(text).toBe("Kept.");
  });

  it("flags Word's automatic numbering, which is not in the text", () => {
    const xml = body(`<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr>${run("Solve for x.")}</w:p>`);
    const { text, usesAutoNumbering } = readDocxBody(xml);
    expect(usesAutoNumbering).toBe(true);
    expect(text).toBe("Solve for x.");
  });

  it("is not confused by a > inside an attribute value", () => {
    const xml = body(para(`<w:r><w:rPr><w:rStyle w:val="a>b"/></w:rPr><w:t>after</w:t></w:r>`));
    expect(readDocxBody(xml).text).toBe("after");
  });

  it("collapses a run of blank paragraphs and trims the ends", () => {
    const xml = body(para("") + para("") + para(run("A")) + para("") + para("") + para("") + para(run("B")) + para(""));
    expect(readDocxBody(xml).text).toBe("A\n\nB");
  });

  it("reads an empty body as empty rather than throwing", () => {
    expect(readDocxBody(body(""))).toEqual({ figures: [], text: "", usesAutoNumbering: false });
  });
});

describe("readRelationships", () => {
  const rels = (inner: string) =>
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${inner}</Relationships>`;

  it("maps each id to the part it names", () => {
    const xml = rels(
      `<Relationship Id="rId4" Type="../image" Target="media/image1.png"/>` +
        `<Relationship Id="rId5" Type="../image" Target="media/image2.emf"/>`,
    );
    expect(readRelationships(xml)).toEqual({ rId4: "media/image1.png", rId5: "media/image2.emf" });
  });

  it("leaves out an external target, which is a link rather than a file in the document", () => {
    const xml = rels(`<Relationship Id="rId6" Target="https://example.test/x.png" TargetMode="External"/>`);
    expect(readRelationships(xml)).toEqual({});
  });
});
