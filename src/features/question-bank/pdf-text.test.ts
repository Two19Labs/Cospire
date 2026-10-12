import { describe, expect, it } from "vitest";

import { type PdfPlacedImage, type PdfTextItem, layoutPdfText } from "./pdf-text";

// One item per line, each ending it, at the heights given (higher is nearer the top).
const lines = (...rows: [string, number][]): PdfTextItem[] => rows.map(([str, y]) => ({ eol: true, str, y }));
const image = (key: string, top: number, bottom: number, left = 0): PdfPlacedImage => ({ bottom, key, left, top });

describe("layoutPdfText", () => {
  it("joins a line's pieces, collapses spacing and drops empty lines", () => {
    const { text } = layoutPdfText([
      {
        images: [],
        items: [
          { eol: false, str: "Q1.  The", y: 700 },
          { eol: false, str: " ", y: 700 },
          { eol: true, str: "average is", y: 700 },
          { eol: true, str: "", y: 690 },
          { eol: true, str: "(a) 1 (b) 2", y: 680 },
        ],
      },
    ]);
    expect(text).toBe("Q1. The average is\n(a) 1 (b) 2");
  });

  it("puts a picture before the first line wholly below it", () => {
    const { figureKeys, text } = layoutPdfText([
      { images: [image("chart", 600, 400)], items: lines(["Study the chart.", 650], ["Q1. Which is largest?", 380]) },
    ]);
    expect(text).toBe("Study the chart.\n[[figure:1]]\nQ1. Which is largest?");
    expect(figureKeys).toEqual(["chart"]);
  });

  it("lets a line level with a picture, such as an option letter, come first", () => {
    const { text } = layoutPdfText([
      {
        images: [image("b", 500, 450), image("a", 560, 510)],
        items: lines(["A.", 530], ["B.", 470], ["Next question", 400]),
      },
    ]);
    expect(text).toBe("A.\n[[figure:1]]\nB.\n[[figure:2]]\nNext question");
  });

  it("orders pictures on one row left to right, and numbers across pages", () => {
    const { figureKeys, text } = layoutPdfText([
      { images: [image("right", 500, 400, 300), image("left", 500, 400, 50)], items: lines(["Top", 600], ["Below", 300]) },
      { images: [image("last", 200, 100)], items: lines(["Page two", 700]) },
    ]);
    expect(figureKeys).toEqual(["left", "right", "last"]);
    expect(text).toBe("Top\n[[figure:1]]\n[[figure:2]]\nBelow\n\nPage two\n[[figure:3]]");
  });

  it("keeps a page that is only a picture", () => {
    const { text } = layoutPdfText([{ images: [image("only", 800, 100)], items: [] }]);
    expect(text).toBe("[[figure:1]]");
  });
});
