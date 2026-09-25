// Object keys for the question-images bucket.
//
// The shape matches `private.question_images_valid` and
// `private.can_access_question_image` in the migrations: the organisation, then
// `questions/`, then a random UUID and an image extension. The uploaded
// filename never reaches the key.

export const questionImagesBucket = "question-images";

// Matches the bucket's `file_size_limit`, which is what actually holds.
export const questionImageMaxBytes = 5 * 1024 * 1024;

// Long enough to edit a question in, short enough that a copied link is not
// worth sharing. Same ten minutes as the document viewer.
export const questionImageUrlTtlSeconds = 600;

const extensionByType: Record<string, string> = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const questionImageTypes = Object.keys(extensionByType);

export function describeImageRejection(file: { size: number; type: string }): string | null {
  if (!extensionByType[file.type]) return "Use a PNG, JPEG, GIF or WebP image.";
  if (file.size > questionImageMaxBytes) return "Images must be 5 MB or smaller.";
  return null;
}

// The same shape `buildQuestionImagePath` writes, read back. It is also what
// `private.question_images_valid` and `private.can_access_question_image`
// enforce, so a path this accepts is one the bucket and the questions table both
// accept -- and a path that reaches a Server Action from a form post is checked
// against it before anything is done with it.
export function isQuestionImagePath(path: string, orgId: number): boolean {
  if (!Number.isSafeInteger(orgId) || orgId <= 0) return false;
  return new RegExp(
    `^org/${orgId}/questions/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(png|jpg|jpeg|gif|webp)$`,
  ).test(path);
}

export function buildQuestionImagePath({
  objectId,
  orgId,
  type,
}: {
  objectId: string;
  orgId: number;
  type: string;
}): string {
  const extension = extensionByType[type];
  if (!extension) throw new Error("Unsupported image type.");
  if (!Number.isSafeInteger(orgId) || orgId <= 0) throw new Error("A positive organisation id is needed.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(objectId)) {
    throw new Error("A random UUID object id is needed.");
  }
  return `org/${orgId}/questions/${objectId}.${extension}`;
}
