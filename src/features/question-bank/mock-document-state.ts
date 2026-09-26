// What the mock-document importer hands back to its screen.
//
// Kept out of `queries/` and `actions/`, which are `server-only`, so the client
// component and the unit tests can both read these shapes.

export interface MockPreviewQuestion {
  // The readable ID, as the document wrote it and the bank shows it.
  label: string;
  id: number;
  excerpt: string;
  marks: string;
  sectionName: string;
  // A DI set brings its sub-questions; this is how many follow the stimulus.
  childCount: number;
  type: "mcq" | "mcq_multi" | "numerical" | "di_stimulus";
}

export interface MockPreviewSection {
  durationMinutes: number | null;
  questions: MockPreviewQuestion[];
  title: string;
}

export interface MockPreview {
  allowMobile: boolean;
  durationMinutes: number;
  maxAttempts: number;
  negativeMarking: number;
  negativeMarkingTypes: string[];
  proctoringEnabled: boolean;
  proctoringStated: boolean;
  // Questions actually written into the mock, sub-questions included, which is
  // more than the count of IDs in the document whenever a DI set is named.
  questionCount: number;
  sections: MockPreviewSection[];
  timingMode: "overall" | "sectional";
  title: string;
}

export interface MockDocumentState {
  // Kept so the paste box still holds what the admin pasted when something is
  // wrong with it.
  pasted: string;
  // Null until a paste reads cleanly. Nothing here is trusted on the way back
  // in: confirming re-parses and re-resolves `pasted` on the server.
  preview: MockPreview | null;
  problems: string[];
}

export const initialMockDocumentState: MockDocumentState = {
  pasted: "",
  preview: null,
  problems: [],
};
