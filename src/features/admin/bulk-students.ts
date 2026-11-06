import { validateIdentity } from "./user-input";

// Bulk student creation from a spreadsheet (clause 2.1, Annexure A). Pure, so
// the rule "every row is checked before anything is created" is tested once
// here (`bulk-students.test.ts`) rather than trusted in the action.

// One invitation email per student. Resend's free plan sends 100 a day and Auth
// is set to 100 an hour (`config.toml`), and clause 3.1 caps the platform at 100
// users, so a bigger sheet cannot be sent anyway.
export const bulkRowLimit = 100;

export interface SheetRow {
  email: string;
  name: string;
  row: number;
}

export interface SheetProblem {
  message: string;
  row: number;
}

// RFC 4180: quoted fields, doubled quotes inside them, CRLF or LF line ends.
// Excel's "CSV UTF-8" export starts with a byte-order mark.
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, "");
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char !== '"') field += char;
      else if (source[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else field += char;
  }
  if (field || record.length) {
    record.push(field);
    records.push(record);
  }
  return records;
}

// The header row names the columns, in any order, matched loosely so "Full
// name" and "Email address" from a Google Sheet work as well as "name, email".
export function readStudentSheet(text: string): {
  problems: SheetProblem[];
  rows: SheetRow[];
} {
  const records = parseCsv(text);
  const header = (records[0] ?? []).map((cell) => cell.trim().toLowerCase());
  const emailAt = header.findIndex((cell) => cell.includes("email"));
  const nameAt = header.findIndex(
    (cell) => cell.includes("name") && !cell.includes("email"),
  );

  if (emailAt < 0 || nameAt < 0) {
    return {
      problems: [
        { message: 'The first row must name the columns "name" and "email".', row: 1 },
      ],
      rows: [],
    };
  }

  const rows: SheetRow[] = [];
  const problems: SheetProblem[] = [];
  const firstRowFor = new Map<string, number>();

  records.slice(1).forEach((cells, index) => {
    const row = index + 2;
    if (cells.every((cell) => !cell.trim())) return;

    const { email, errors, name } = validateIdentity({
      email: cells[emailAt] ?? "",
      name: cells[nameAt] ?? "",
    });
    if (errors.name || errors.email) {
      problems.push({
        message: [errors.name, errors.email].filter(Boolean).join(" "),
        row,
      });
      return;
    }

    const first = firstRowFor.get(email);
    if (first) {
      problems.push({ message: `${email} is already on row ${first}.`, row });
      return;
    }
    firstRowFor.set(email, row);
    rows.push({ email, name, row });
  });

  if (rows.length === 0 && problems.length === 0) {
    problems.push({ message: "The sheet has no students in it.", row: 1 });
  }
  if (rows.length > bulkRowLimit) {
    problems.push({
      message: `Up to ${bulkRowLimit} students per upload; this sheet has ${rows.length}.`,
      row: rows[bulkRowLimit].row,
    });
  }

  return { problems, rows };
}
