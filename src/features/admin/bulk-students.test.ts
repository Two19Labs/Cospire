import { describe, expect, it } from "vitest";

import { bulkRowLimit, parseCsv, readStudentSheet } from "./bulk-students";

describe("parseCsv", () => {
  it("reads quoted fields, doubled quotes, CRLF and a byte-order mark", () => {
    expect(parseCsv('﻿name,email\r\n"Rao, Priya","p@x.in"\r\n"Said ""Sam""",s@x.in')).toEqual([
      ["name", "email"],
      ["Rao, Priya", "p@x.in"],
      ['Said "Sam"', "s@x.in"],
    ]);
  });

  it("does not invent a record from a trailing newline", () => {
    expect(parseCsv("name,email\na,b@c.in\n")).toEqual([
      ["name", "email"],
      ["a", "b@c.in"],
    ]);
  });
});

describe("readStudentSheet", () => {
  it("normalises names and emails, in either column order, skipping blank rows", () => {
    const { problems, rows } = readStudentSheet(
      "Email address,Full name\n PRIYA@Cospire.in ,priya  rao\n,\nsam@cospire.in,Sam K\n",
    );
    expect(problems).toEqual([]);
    expect(rows).toEqual([
      { email: "priya@cospire.in", name: "Priya rao", row: 2 },
      { email: "sam@cospire.in", name: "Sam K", row: 4 },
    ]);
  });

  it("refuses a sheet without the two columns", () => {
    expect(readStudentSheet("student,mail\na,b@c.in").problems[0].row).toBe(1);
  });

  // The contract: one bad row is reported, by its row number, and the good rows
  // are still returned only so the action can refuse the whole sheet.
  it("reports every bad row and every repeat by its spreadsheet row", () => {
    const { problems } = readStudentSheet(
      "name,email\nA,a@x.in\n,b@x.in\nC,not-an-email\nD,A@X.in\n",
    );
    expect(problems.map((p) => p.row)).toEqual([3, 4, 5]);
    expect(problems[2].message).toContain("row 2");
  });

  it("refuses an empty sheet", () => {
    expect(readStudentSheet("name,email\n").problems).toHaveLength(1);
  });

  it(`refuses more than ${bulkRowLimit} students`, () => {
    const lines = Array.from({ length: bulkRowLimit + 1 }, (_, i) => `S ${i},s${i}@x.in`);
    const { problems } = readStudentSheet(`name,email\n${lines.join("\n")}`);
    expect(problems).toHaveLength(1);
    expect(problems[0].row).toBe(bulkRowLimit + 2);
  });
});
