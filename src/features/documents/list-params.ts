// Pure request-parameter handling for the document library.
//
// Kept out of the `queries/` modules deliberately, for the same reason
// `src/features/admin/list-params.ts` is: those modules are `server-only`, which
// Next.js resolves through a bundler alias rather than a real package, so
// anything importing them is unreachable from a unit test. The filter-injection
// guard below is exactly the kind of code that must stay directly testable.

// Paginated from the first commit, per operating manual §8.
export const documentsPageSize = 25;

// PostgREST reads `or=(...)` as a comma-separated list of filters, so a comma,
// parenthesis, backslash or double quote inside the term rewrites the filter
// rather than being matched by it. `%` is an ilike wildcard. None of the five
// mean anything inside a document title, so they are dropped.
//
// `_` is also a wildcard and is deliberately kept: the worst it can do is widen
// the match, which is not a security property.
export function sanitizeDocumentSearch(raw: string): string {
  return raw
    .replace(/[,()\\"%]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

// The folder filter is an equality match rather than a pattern, so it needs no
// wildcard handling -- but it is still user input reaching a query, and a folder
// that could never have been stored should never be asked for. The bounds match
// `documents_folder_normalized` in the migration.
export function sanitizeFolderFilter(raw: string): string {
  const folder = raw.replace(/[/\\]/g, " ").replace(/\s+/g, " ").trim();
  return folder.length > 80 ? "" : folder;
}

// Duplicated from `src/features/admin/list-params.ts` rather than imported.
//
// It is four lines of generic code and its natural home is `src/shared/`, which
// operating manual §6 puts behind a human promotion. Importing it across a
// feature boundary instead would couple the document library to the admin
// console's internals for no benefit. A human can collapse the two when
// something else needs it.
export function parsePageNumber(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 1 ? parsed : 1;
}

// A document id arrives from a URL segment or a form field. It is a bigint in
// the database, so anything that is not a positive whole number is refused here
// rather than sent to Postgres to fail as a type error.
export function parseDocumentId(raw: string | undefined): number | null {
  if (!raw || !/^[0-9]{1,18}$/.test(raw)) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

// Every link and post-action redirect into the library is built here, from
// parsed values only, so no form field can ever influence the destination. Same
// open-redirect reasoning as the admin console's `buildUsersHref`.
export function buildDocumentsHref({
  error,
  folder,
  page,
  search,
}: {
  error?: DocumentListError;
  folder?: string;
  page: number;
  search: string;
}): string {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (folder) params.set("folder", folder);
  if (page > 1) params.set("page", String(page));
  if (error) params.set("error", error);
  const query = params.toString();
  return query ? `/admin/documents?${query}` : "/admin/documents";
}

export function buildDocumentHref({
  documentId,
  error,
  notice,
}: {
  documentId: number;
  error?: DocumentListError;
  notice?: DocumentNotice;
}): string {
  const params = new URLSearchParams();
  if (error) params.set("error", error);
  if (notice) params.set("notice", notice);
  const query = params.toString();
  return query
    ? `/admin/documents/${documentId}?${query}`
    : `/admin/documents/${documentId}`;
}

// A closed set, so a crafted `?error=` value renders nothing at all rather than
// reaching the page.
export const documentListErrors = {
  "access-change-failed":
    "That access change was refused. Nothing changed.",
  "invalid-request": "That request was not valid. Nothing changed.",
  "upload-failed":
    "The upload could not be recorded. If a file was transferred it has not " +
    "been added to the library, and can be uploaded again.",
} as const;

export type DocumentListError = keyof typeof documentListErrors;

export function parseDocumentListError(
  raw: string | undefined,
): DocumentListError | null {
  if (raw && Object.hasOwn(documentListErrors, raw)) {
    return raw as DocumentListError;
  }
  return null;
}

export const documentNotices = {
  granted: "Access granted.",
  revoked: "Access removed.",
  uploaded: "Document added to the library.",
} as const;

export type DocumentNotice = keyof typeof documentNotices;

export function parseDocumentNotice(
  raw: string | undefined,
): DocumentNotice | null {
  if (raw && Object.hasOwn(documentNotices, raw)) {
    return raw as DocumentNotice;
  }
  return null;
}
