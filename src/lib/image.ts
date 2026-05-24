import sharp from "sharp";
import { MAX_UPLOAD_BYTES, MODEL_IMAGE_MAX_EDGE, MODEL_IMAGE_QUALITY } from "@/lib/config";

export type PreparedImage = {
  original: Buffer;
  compressed: Buffer;
  originalBytes: number;
  compressedBytes: number;
  contentType: "image/jpeg";
};

export async function prepareMealImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) throw new Error("请上传图片文件");
  const original = Buffer.from(await file.arrayBuffer());
  if (original.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(`图片不能超过 ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB`);
  }

  const compressed = await sharp(original)
    .rotate()
    .resize({
      width: MODEL_IMAGE_MAX_EDGE,
      height: MODEL_IMAGE_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true
    })
    .jpeg({
      quality: MODEL_IMAGE_QUALITY,
      mozjpeg: true
    })
    .toBuffer();

  return {
    original,
    compressed,
    originalBytes: original.byteLength,
    compressedBytes: compressed.byteLength,
    contentType: "image/jpeg"
  };
}

export function toDataUrl(buffer: Buffer, contentType: string) {
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}
