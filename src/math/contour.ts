import type { Point } from "../types";

export const SAMPLE_COUNT = 1024;

export function measureContour(points: readonly Point[], closed: boolean): number {
  if (points.length < 2) return 0;

  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += distance(points[index - 1]!, points[index]!);
  }
  if (closed) length += distance(points.at(-1)!, points[0]!);
  return length;
}

export function resampleContour(
  points: readonly Point[],
  closed: boolean,
  sampleCount = SAMPLE_COUNT,
): Point[] {
  if (points.length < 2 || sampleCount < 2) {
    throw new Error("A contour needs at least two points.");
  }

  const segmentLengths: number[] = [];
  const segmentCount = closed ? points.length : points.length - 1;
  for (let index = 0; index < segmentCount; index += 1) {
    segmentLengths.push(distance(points[index]!, points[(index + 1) % points.length]!));
  }

  const cumulativeLengths = [0];
  for (const segmentLength of segmentLengths) {
    cumulativeLengths.push(cumulativeLengths.at(-1)! + segmentLength);
  }

  const totalLength = cumulativeLengths.at(-1)!;
  if (!Number.isFinite(totalLength) || totalLength <= Number.EPSILON) {
    throw new Error("The contour has no measurable length.");
  }

  const samples: Point[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const fraction = closed ? index / sampleCount : index / (sampleCount - 1);
    const targetLength = fraction * totalLength;
    let segmentIndex = lowerBound(cumulativeLengths, targetLength) - 1;
    segmentIndex = Math.max(0, Math.min(segmentIndex, segmentLengths.length - 1));

    while (segmentIndex < segmentLengths.length - 1 && segmentLengths[segmentIndex]! === 0) {
      segmentIndex += 1;
    }

    const segmentLength = segmentLengths[segmentIndex]!;
    const segmentStart = points[segmentIndex]!;
    const segmentEnd = points[(segmentIndex + 1) % points.length]!;
    const localFraction = segmentLength === 0
      ? 0
      : (targetLength - cumulativeLengths[segmentIndex]!) / segmentLength;
    samples.push({
      x: segmentStart.x + (segmentEnd.x - segmentStart.x) * localFraction,
      y: segmentStart.y + (segmentEnd.y - segmentStart.y) * localFraction,
    });
  }
  return samples;
}

export function simplifyPixelContour(points: readonly Point[]): Point[] {
  if (points.length < 4) return [...points];
  const simplified: Point[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index + points.length - 1) % points.length]!;
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    const incomingX = current.x - previous.x;
    const incomingY = current.y - previous.y;
    const outgoingX = next.x - current.x;
    const outgoingY = next.y - current.y;
    if (incomingX * outgoingY === incomingY * outgoingX && incomingX * outgoingX + incomingY * outgoingY >= 0) {
      continue;
    }
    simplified.push(current);
  }
  return simplified.length >= 2 ? simplified : [...points];
}

function distance(left: Point, right: Point): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function lowerBound(values: readonly number[], target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (values[middle]! < target) low = middle + 1;
    else high = middle;
  }
  return low;
}
