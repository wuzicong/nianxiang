import exifReader from "exif-reader";
import sharp from "sharp";
import { DERIVATIVE_SIZES, type DerivativeSize } from "@memora/shared";
import { extractExifFields, orientedSize, type ParsedExif } from "./exif-summary.js";

const SHARP_OPTIONS = {
  failOn: "error" as const,
  animated: false,
  limitInputPixels: 40_000_000,
};

const SPECS: Record<DerivativeSize, { maxEdge: number; quality: number }> = {
  thumb: { maxEdge: 480, quality: 70 },
  preview: { maxEdge: 1600, quality: 78 },
  hero: { maxEdge: 2560, quality: 82 },
};

export interface RenderedDerivative {
  size: DerivativeSize;
  body: Buffer;
}

export interface RenderedSet {
  width?: number;
  height?: number;
  files: RenderedDerivative[];
}

export async function renderDerivatives(input: Buffer): Promise<RenderedSet> {
  const meta = await sharp(input, SHARP_OPTIONS).metadata();
  const oriented = orientedSize(meta.width, meta.height, meta.orientation);
  const files: RenderedDerivative[] = [];
  for (const size of DERIVATIVE_SIZES) {
    const spec = SPECS[size];
    const body = await sharp(input, SHARP_OPTIONS)
      .rotate()
      .resize({
        width: spec.maxEdge,
        height: spec.maxEdge,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: spec.quality })
      .toBuffer();
    files.push({ size, body });
  }
  return { width: oriented.width, height: oriented.height, files };
}

function parseExif(buffer: Buffer): unknown {
  try {
    return exifReader(buffer);
  } catch {
    return null;
  }
}

export async function readImageSummary(input: Buffer): Promise<ParsedExif> {
  const meta = await sharp(input, SHARP_OPTIONS).metadata();
  const oriented = orientedSize(meta.width, meta.height, meta.orientation);
  const fields = extractExifFields(meta.exif ? parseExif(meta.exif) : null);
  return {
    ...fields,
    width: oriented.width,
    height: oriented.height,
    format: meta.format,
    orientation: meta.orientation,
  };
}
