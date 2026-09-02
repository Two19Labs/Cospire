// Validation for everything an admin types about a document.
//
// The bounds here match the check constraints in
// `20260902180054_documents_library_and_storage.sql` exactly. The database is
// the enforcer; this exists so an admin gets a sentence they can act on instead
// of a constraint violation.

export interface NewDocumentFieldErrors {
  folder?: string;
  title?: string;
}

export interface NewDocumentValue {
  folder: string;
  title: string;
}

export interface NewDocumentValidation {
  errors: NewDocumentFieldErrors;
  value: NewDocumentValue | null;
}

export const documentTitleMaxLength = 200;
export const documentFolderMaxLength = 80;

export function validateNewDocument(input: {
  folder: unknown;
  title: unknown;
}): NewDocumentValidation {
  const errors: NewDocumentFieldErrors = {};

  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) {
    errors.title = "Give the document a title.";
  } else if (title.length > documentTitleMaxLength) {
    errors.title = `Use at most ${documentTitleMaxLength} characters.`;
  }

  // A folder is optional. Empty means unfiled, which the library shows as its
  // own group rather than hiding.
  const folder = typeof input.folder === "string" ? input.folder.trim() : "";
  if (folder.length > documentFolderMaxLength) {
    errors.folder = `Use at most ${documentFolderMaxLength} characters.`;
  } else if (/[/\\]/.test(folder)) {
    // Folders are a flat label, not a path. Rejecting the separator here keeps
    // the promise the UI makes, and keeps a folder name from ever looking like
    // the object keys in `storage.ts`.
    errors.folder = "Folder names cannot contain slashes.";
  }

  if (Object.keys(errors).length > 0) {
    return { errors, value: null };
  }

  return { errors, value: { folder, title } };
}

// The bucket declares `allowed_mime_types = {application/pdf}`, so Storage
// refuses anything else at upload. This is the same rule stated early, so an
// admin who picks a Word document is told before the bytes are sent rather than
// after.
export const documentMimeType = "application/pdf";

// Matches the bucket's `file_size_limit`, which is also the project-wide cap in
// supabase/config.toml.
export const documentMaxBytes = 52_428_800;

export function describeFileRejection(file: {
  size: number;
  type: string;
}): string | null {
  if (file.type !== documentMimeType) {
    return "Only PDF files can be added to the library.";
  }

  if (file.size <= 0) {
    return "That file is empty.";
  }

  if (file.size > documentMaxBytes) {
    return "That file is larger than the 50 MB limit.";
  }

  return null;
}
