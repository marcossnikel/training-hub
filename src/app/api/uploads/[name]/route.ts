import fs from "node:fs";
import path from "node:path";
import { get } from "@vercel/blob";
import type { NextRequest } from "next/server";
import { UPLOADS_DIR } from "@/lib/db";
import { blobEnabled, contentTypeForName } from "@/lib/storage";
import { requireCurrentUser } from "@/lib/auth";

// Photos are mutable at the app level (a gear photo can be replaced, and the old
// asset is deleted), so they must NOT be cached as year-long immutables (T3.8):
// a short, revalidated window keeps them fast to serve while a replacement is
// picked up promptly instead of being stuck in a cache for up to a year.
const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=300, must-revalidate",
  "X-Content-Type-Options": "nosniff",
};

/** Serves gear photos: local data/uploads first, then the private Blob store. */
export async function GET(_request: NextRequest, context: { params: Promise<{ name: string }> }) {
  if (!(await requireCurrentUser())) return new Response(null, { status: 401 });
  const { name } = await context.params;
  const safeName = path.basename(name);
  const type = contentTypeForName(safeName);
  if (!type) {
    return new Response("Unsupported file type", { status: 415 });
  }

  const filePath = path.join(UPLOADS_DIR, safeName);
  if (fs.existsSync(filePath)) {
    const file = fs.readFileSync(filePath);
    return new Response(new Uint8Array(file), {
      headers: { "Content-Type": type, ...CACHE_HEADERS },
    });
  }

  let reason = "blob-disabled";
  if (blobEnabled()) {
    try {
      const result = await get(safeName, { access: "private" });
      if (result && result.statusCode === 200) {
        return new Response(result.stream, {
          headers: {
            "Content-Type": result.blob.contentType || type,
            ...CACHE_HEADERS,
          },
        });
      }
      reason = "blob-miss";
    } catch (error) {
      reason = "blob-error";
      console.error("uploads route blob error:", error);
    }
  }

  return new Response("Not found", { status: 404, headers: { "x-uploads": reason } });
}
