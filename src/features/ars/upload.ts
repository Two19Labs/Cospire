export const arsUploadsBucket = "ars-uploads";
export const arsUploadMaxBytes = 50 * 1024 * 1024;

// A question may set a lower limit than the bucket's, like 5 MB for a marksheet.
export function uploadLimitBytes(field: { maxSizeMb?: number }): number {
  return Math.min(arsUploadMaxBytes, (field.maxSizeMb ?? 50) * 1024 * 1024);
}

export const arsUploadMimeExtensions: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface StoredArsUpload {
  mimeType: string;
  originalName: string;
  size: number;
  storagePath: string;
}

export function isStoredArsUpload(value: unknown): value is StoredArsUpload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const upload = value as Record<string, unknown>;
  return (
    typeof upload.storagePath === "string" &&
    typeof upload.originalName === "string" &&
    typeof upload.mimeType === "string" &&
    typeof upload.size === "number" &&
    Number.isSafeInteger(upload.size) &&
    upload.size > 0
  );
}

export function describeArsUploadRejection(file: {
  size: number;
  type: string;
}, accepted: string[], limitBytes: number = arsUploadMaxBytes): string | null {
  const extension = arsUploadMimeExtensions[file.type];
  if (!extension || !accepted.includes(extension)) return "Choose one of the allowed file types.";
  if (!Number.isSafeInteger(file.size) || file.size <= 0) return "That file is empty.";
  if (file.size > limitBytes) return `Choose a file smaller than ${Math.round(limitBytes / 1024 / 1024)} MB.`;
  return null;
}

export function buildArsUploadPath(input: {
  extension: string;
  objectId: string;
  orgId: number;
  studentId: string;
}): string {
  if (!/^[a-z0-9]{1,8}$/.test(input.extension)) throw new Error("Invalid upload extension.");
  if (!uuidPattern.test(input.objectId)) throw new Error("Invalid upload id.");
  if (!Number.isSafeInteger(input.orgId) || input.orgId <= 0) throw new Error("Invalid organisation.");
  if (!uuidPattern.test(input.studentId)) throw new Error("Invalid student.");
  return `org/${input.orgId}/ars/${input.studentId}/${input.objectId}.${input.extension}`;
}
