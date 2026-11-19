import { measureContour } from "../math/contour";
import { analyzeContour } from "../math/fft";
import type { Bounds, Contour, ProcessedDrawing } from "../types";
import { MAX_CONTOURS } from "./raster";

export function processContours(
  contours: readonly Contour[],
  skipped = 0,
  omitted = 0,
): ProcessedDrawing {
  const measured = contours
    .filter((contour) => contour.points.length >= 2 && contour.points.every(isFinitePoint))
    .map((contour) => ({ contour, length: measureContour(contour.points, contour.closed) }))
    .filter(({ length }) => Number.isFinite(length) && length > 0)
    .sort((left, right) => right.length - left.length);

  const accepted = measured.slice(0, MAX_CONTOURS);
  if (accepted.length === 0) throw new Error("No usable outlines were found in this image.");

  const points = accepted.flatMap(({ contour }) => contour.points);
  const bounds = getBounds(points);
  const processed = accepted.map(({ contour }) => analyzeContour(contour));
  return {
    contours: processed,
    bounds,
    skipped,
    omitted: omitted + Math.max(0, measured.length - accepted.length),
  };
}

function isFinitePoint(point: { x: number; y: number }): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function getBounds(points: readonly { x: number; y: number }[]): Bounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  if (maxX - minX < 1e-9) { minX -= 0.5; maxX += 0.5; }
  if (maxY - minY < 1e-9) { minY -= 0.5; maxY += 0.5; }
  return { minX, minY, maxX, maxY };
}
