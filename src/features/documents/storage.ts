// Object keys for the documents bucket.
//
// Pure and testable on purpose: the shape produced here is also asserted by the
// `documents_storage_path_scoped` check constraint in
// `20260902180054_documents_library_and_storage.sql`, and the two drifting apart
// would surface as an insert failure long after the upload succeeded.

export const documentsBucket = "documents";

// How long a view URL lives. The agreement asks for five to fifteen minutes;
// ten sits in the middle and is long enough to open a large PDF on a slow
// connection without being long enough for a copied link to be worth sharing.
export const documentUrlTtlSeconds = 600;

const objectIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// The key carries the organisation and a random UUID, and nothing else.
//
// The uploaded filename is deliberately absent. It would leak the document's
// subject to anyone who saw a path, and it is attacker-controlled text heading
// for an object store, which is how `../` and encoding bugs arrive. The title
// the admin types is stored in a column instead, where it is only ever read
// back as data.
export function buildDocumentStoragePath({
  objectId,
  orgId,
}: {
  objectId: string;
  orgId: number;
}): string {
  if (!Number.isSafeInteger(orgId) || orgId <= 0) {
    throw new Error("A document storage path needs a positive organisation id.");
  }

  if (!objectIdPattern.test(objectId)) {
    throw new Error("A document storage path needs a random UUID object id.");
  }

  return `org/${orgId}/${objectId}.pdf`;
}

export function isDocumentStoragePath({
  orgId,
  path,
}: {
  orgId: number;
  path: string;
}): boolean {
  const [prefix, org, file, ...rest] = path.split("/");
  if (rest.length > 0) return false;
  if (prefix !== "org" || org !== String(orgId)) return false;
  if (typeof file !== "string" || !file.endsWith(".pdf")) return false;
  return objectIdPattern.test(file.slice(0, -".pdf".length));
}
