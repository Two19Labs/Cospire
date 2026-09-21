import type { ImportedItem } from "./import-spec";

export interface QuestionImportState {
  defaultMarks: string;
  documentName: string;
  // What would be staged. Null until a paste has been read. Nothing here is
  // trusted on the way back in: staging re-parses `pasted` on the server.
  items: ImportedItem[] | null;
  // Kept so the paste box keeps what the admin pasted when something is wrong.
  pasted: string;
  problems: string[];
}

export const initialQuestionImportState: QuestionImportState = {
  defaultMarks: "",
  documentName: "",
  items: null,
  pasted: "",
  problems: [],
};

// UUIDs only: a batch id reaches a query from the URL.
export function parseBatchId(raw: unknown): string | null {
  return typeof raw === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(raw)
    ? raw
    : null;
}
