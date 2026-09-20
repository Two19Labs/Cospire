// Form state for the process importer.
//
// Outside the action file on purpose: a `"use server"` module may export only
// async functions, because every export becomes a callable server endpoint. A
// plain object exported from there fails at load with `A "use server" file can
// only export async functions, found object` and takes the page down with it --
// the same trap that broke the login page on 2026-08-28.

import type { ImportedRound } from "./import-spec";

export interface ImportState {
  // Returned so the textarea keeps what the admin pasted. Losing a paste this
  // long because one round had no instructions would be its own reason not to
  // use the feature.
  pasted: string;
  // Everything wrong with the paste, all of it at once.
  problems: string[];
  // What would be created. Null until a paste has been read successfully.
  // Nothing here is trusted on the way back in: confirming re-parses `pasted`
  // on the server rather than believing this.
  rounds: ImportedRound[] | null;
  programmeName: string | null;
}

export const initialImportState: ImportState = {
  pasted: "",
  problems: [],
  programmeName: null,
  rounds: null,
};
