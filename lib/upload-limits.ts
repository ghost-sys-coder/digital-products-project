export const DOWNLOAD_UPLOAD_LIMIT = 5 * 1024 * 1024;
// Keep the existing allowance: covers already support more than the requested 1 MB.
export const COVER_UPLOAD_LIMIT = 3 * 1024 * 1024;
export type ProductUploadKind = "download" | "cover";
export const productUploadLimit = (kind: ProductUploadKind) => kind === "cover" ? COVER_UPLOAD_LIMIT : DOWNLOAD_UPLOAD_LIMIT;
export const productUploadLimitLabel = (kind: ProductUploadKind) => kind === "cover" ? "3 MB" : "5 MB";
