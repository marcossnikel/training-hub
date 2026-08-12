import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { put, del } from "@vercel/blob";
import { UPLOADS_DIR } from "./db";
import { logger } from "./telemetry";
import type { OwnerContext } from "./owner-context";

/**
 * The single image-type allowlist (T3.8): MIME -> stored file extension. Both the
 * upload path (content sniff) and the serving route derive their behavior from
 * this one map, so the accepted set lives in exactly one place.
 */
export const IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
} as const;

export type ImageMime = keyof typeof IMAGE_TYPES;

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

/**
 * Thrown when an upload's bytes are not a recognized image. The server action
 * maps this to a controlled, localized `t.errors.invalidImage`; the raw message
 * is a dev-facing fallback only and never reaches the client.
 */
export class InvalidImageError extends Error {
  constructor() {
    super("Uploaded file is not a valid image.");
    this.name = "InvalidImageError";
  }
}

/** True if the ftyp box's brand list (major + compatible) advertises AVIF. */
function hasAvifBrand(bytes: Uint8Array): boolean {
  const brandAt = (i: number): string =>
    String.fromCharCode(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]);
  const isAvif = (brand: string): boolean => brand === "avif" || brand === "avis";

  // ftyp box layout: [0,4) size (big-endian, unsigned), [4,8) "ftyp", [8,12)
  // major brand, [12,16) minor version, [16,end) compatible brands (4B each).
  // Read the declared box size and scan EVERY brand, not just a fixed 32-byte
  // window — a valid AVIF may list its `avif`/`avis` brand deeper in the list.
  const boxSize = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  // size 0 means "to end of file"; a bogus/too-small size also falls back to
  // the buffer length. Always clamp to the actual buffer so we never overread.
  const end = Math.min(bytes.length, boxSize > 8 ? boxSize : bytes.length);

  if (end >= 12 && isAvif(brandAt(8))) return true; // major brand
  for (let i = 16; i + 4 <= end; i += 4) {
    if (isAvif(brandAt(i))) return true; // compatible brands
  }
  return false;
}

/**
 * Content-sniffs image bytes by MAGIC NUMBER and returns the detected MIME
 * (restricted to the allowlist) or null when the bytes are not a recognized
 * image. The client-declared `file.type` is deliberately never consulted — this
 * is the spoof guard (G11.5): a non-image sent with an image MIME resolves to
 * null and is rejected upstream.
 */
export function sniffImageType(bytes: Uint8Array): ImageMime | null {
  // JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  // GIF: "GIF8" (covers both GIF87a and GIF89a)
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return "image/gif";
  }
  // WebP: "RIFF" (0-3) .... "WEBP" (8-11)
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  // AVIF: ISOBMFF "ftyp" box (4-7) advertising an AVIF brand
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70 &&
    hasAvifBrand(bytes)
  ) {
    return "image/avif";
  }
  return null;
}

/** Maps a stored filename's extension to its served Content-Type, or null. */
export function contentTypeForName(name: string): ImageMime | null {
  const ext = path.extname(name).slice(1).toLowerCase();
  const normalized = ext === "jpeg" ? "jpg" : ext;
  for (const mime of Object.keys(IMAGE_TYPES) as ImageMime[]) {
    if (IMAGE_TYPES[mime] === normalized) return mime;
  }
  return null;
}

/**
 * Vercel Blob is used when its credentials are present; otherwise photos stay
 * on disk. Locally that is BLOB_READ_WRITE_TOKEN; on Vercel a dashboard-connected
 * store may inject only BLOB_STORE_ID and authenticate through the OIDC token.
 */
export function blobEnabled(): boolean {
  return !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

/**
 * Stores a gear photo and returns the filename to keep in shoes/bikes.photo_path.
 * The stored type and extension are decided by CONTENT sniff, not the client MIME
 * (G11.5): bytes that are not a real image throw InvalidImageError. With a Blob
 * token the file goes to the (private) Vercel Blob store, else to data/uploads/.
 * Either way the uploads route serves it by that filename.
 */
export async function storePhoto(owner: OwnerContext, file: File): Promise<string> {
  if (file.size > MAX_PHOTO_BYTES) throw new Error("Photo is too large (8 MB max).");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImageType(bytes);
  if (!mime) throw new InvalidImageError();
  const ext = IMAGE_TYPES[mime];
  // The opaque owner digest is part of a private object key, not a client-visible
  // identifier or an authorization decision. Route reads still resolve it through
  // an owner-filtered gear record before touching local disk or Blob.
  const ownerKey = crypto.createHash("sha256").update(owner.userId).digest("hex").slice(0, 16);
  const name = `gear-${ownerKey}-${crypto.randomUUID()}.${ext}`;

  if (blobEnabled()) {
    const blob = await put(name, file, { access: "private", contentType: mime });
    return blob.pathname;
  }

  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOADS_DIR, name), Buffer.from(bytes));
  return name;
}

/**
 * Best-effort deletion of a previously stored photo, mirroring storePhoto's
 * storage split (Blob in prod, local disk in dev). NEVER throws across the action
 * seam (T3.8): an orphaned asset must not fail the surrounding gear save/update.
 * Failures are logged through the telemetry seam instead. External http(s) URLs
 * are left untouched — they were not minted here.
 */
export async function deletePhoto(owner: OwnerContext, photoPath: string | null): Promise<void> {
  if (!photoPath || photoPath.startsWith("http")) return;
  try {
    if (blobEnabled()) {
      await del(photoPath);
      return;
    }
    await fs.promises.rm(path.join(UPLOADS_DIR, path.basename(photoPath)), { force: true });
  } catch (error) {
    logger.error("storage.deletePhoto", { error, ownerId: owner.userId });
  }
}

/** Resolves a stored photo_path to an <img> src served by the uploads route. */
export function photoSrc(photoPath: string | null): string | null {
  if (!photoPath) return null;
  if (photoPath.startsWith("http")) return photoPath;
  return `/api/uploads/${encodeURIComponent(photoPath)}`;
}
