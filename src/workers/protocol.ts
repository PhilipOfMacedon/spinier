import type { Contour, ProcessedDrawing } from "../types";

export type ProcessorRequest =
  | { requestId: number; kind: "contours"; contours: Contour[]; skipped?: number; omitted?: number }
  | { requestId: number; kind: "raster"; width: number; height: number; pixels: Uint8ClampedArray; threshold: number; invert: boolean };

export type ProcessorResponse =
  | { requestId: number; ok: true; drawing: ProcessedDrawing; transparent?: boolean }
  | { requestId: number; ok: false; error: string };
