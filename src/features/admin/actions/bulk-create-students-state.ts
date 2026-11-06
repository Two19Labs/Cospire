import type { SheetProblem } from "../bulk-students";

// Kept out of the "use server" file, which may export async functions only
// (see `create-user-state.ts`).
export interface BulkCreateStudentsState {
  created: number;
  error: string | null;
  problems: SheetProblem[];
}

export const initialBulkCreateStudentsState: BulkCreateStudentsState = {
  created: 0,
  error: null,
  problems: [],
};
