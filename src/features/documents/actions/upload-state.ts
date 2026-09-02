import type { NewDocumentFieldErrors } from "../document-input";

// Types only, in their own module.
//
// A `"use server"` file may export nothing but async functions -- Next.js fails
// the build otherwise, which is exactly what broke the Phase 0 login page. Types
// are erased at compile time and so are safe here, but the rule is easier to
// keep by never putting anything else in an actions file at all.

export interface UploadTicket {
  ok: true;
  // The object key the row will later record. Returned so the browser can hand
  // it straight back, rather than the server having to remember it between two
  // stateless calls.
  path: string;
  token: string;
}

export interface UploadRejection {
  error: string | null;
  fieldErrors: NewDocumentFieldErrors;
  ok: false;
}

export type UploadTicketResult = UploadTicket | UploadRejection;
