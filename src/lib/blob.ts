import { put } from "@vercel/blob";
import { optionalEnv } from "@/lib/config";

export async function uploadImage(name: string, body: Buffer, contentType: string) {
  if (!optionalEnv("BLOB_READ_WRITE_TOKEN")) return null;
  const blob = await put(name, body, {
    access: "public",
    contentType,
    addRandomSuffix: true
  });
  return blob.url;
}
