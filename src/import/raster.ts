import { simplifyPixelContour } from "../math/contour";
import type { Contour, Point } from "../types";

export const MAX_CONTOURS = 24;

export interface RasterPixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface RasterTraceResult {
  contours: Contour[];
  omitted: number;
  transparent: boolean;
}

interface BoundaryEdges {
  start: Int32Array;
  end: Int32Array;
  direction: Uint8Array;
  next: Int32Array;
  used: Uint8Array;
  heads: Int32Array;
  count: number;
}

export function traceRaster(
  raster: RasterPixels,
  threshold: number,
  invert: boolean,
  maximumContours = MAX_CONTOURS,
): RasterTraceResult {
  const { width, height, data } = raster;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error("The raster image has invalid dimensions.");
  }
  if (data.length !== width * height * 4) {
    throw new Error("The raster image data is incomplete.");
  }

  const transparent = hasTransparency(data);
  const mask = createMask(data, threshold, invert, transparent);
  const edges = traceBoundaryEdges(mask, width, height);
  const traced: Array<{ points: Point[]; length: number }> = [];

  for (let index = 0; index < edges.count; index += 1) {
    if (edges.used[index]) continue;
    const startVertex = edges.start[index]!;
    const points: Point[] = [];
    let edgeIndex = index;
    let closed = false;
    let guard = 0;

    while (!edges.used[edgeIndex] && guard <= edges.count) {
      edges.used[edgeIndex] = 1;
      const vertex = edges.start[edgeIndex]!;
      points.push({ x: vertex % (width + 1), y: Math.floor(vertex / (width + 1)) });
      const endVertex = edges.end[edgeIndex]!;
      if (endVertex === startVertex) {
        closed = true;
        break;
      }
      const nextEdge = chooseNextEdge(edges, endVertex, edges.direction[edgeIndex]!);
      if (nextEdge === -1) break;
      edgeIndex = nextEdge;
      guard += 1;
    }

    if (!closed || points.length < 4) continue;
    const simplified = simplifyPixelContour(points);
    const length = measureClosedPolyline(simplified);
    if (length > 0) traced.push({ points: simplified, length });
  }

  traced.sort((left, right) => right.length - left.length);
  return {
    contours: traced.slice(0, maximumContours).map(({ points }, index) => ({
      id: `raster-${index}`,
      label: `Outline ${index + 1}`,
      points,
      closed: true,
      source: "raster",
    })),
    omitted: Math.max(0, traced.length - maximumContours),
    transparent,
  };
}

function hasTransparency(data: Uint8ClampedArray): boolean {
  for (let index = 3; index < data.length; index += 4) {
    if (data[index]! < 255) return true;
  }
  return false;
}

function createMask(
  data: Uint8ClampedArray,
  threshold: number,
  invert: boolean,
  transparent: boolean,
): Uint8Array {
  const mask = new Uint8Array(data.length / 4);
  for (let pixel = 0, dataIndex = 0; pixel < mask.length; pixel += 1, dataIndex += 4) {
    let foreground: boolean;
    if (transparent) {
      foreground = data[dataIndex + 3]! >= 128;
    } else {
      const luminance = Math.round(
        0.2126 * data[dataIndex]! +
        0.7152 * data[dataIndex + 1]! +
        0.0722 * data[dataIndex + 2]!,
      );
      foreground = luminance <= threshold;
    }
    mask[pixel] = Number(invert ? !foreground : foreground);
  }
  return mask;
}

function traceBoundaryEdges(mask: Uint8Array, width: number, height: number): BoundaryEdges {
  const maxEdges = Math.max(4, width * height * 2 + width + height);
  const vertexCount = (width + 1) * (height + 1);
  const edges: BoundaryEdges = {
    start: new Int32Array(maxEdges),
    end: new Int32Array(maxEdges),
    direction: new Uint8Array(maxEdges),
    next: new Int32Array(maxEdges),
    used: new Uint8Array(maxEdges),
    heads: new Int32Array(vertexCount),
    count: 0,
  };
  edges.heads.fill(-1);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      if (y === 0 || !mask[(y - 1) * width + x]) addEdge(edges, vertex(x, y, width), vertex(x + 1, y, width), 0);
      if (x === width - 1 || !mask[y * width + x + 1]) addEdge(edges, vertex(x + 1, y, width), vertex(x + 1, y + 1, width), 1);
      if (y === height - 1 || !mask[(y + 1) * width + x]) addEdge(edges, vertex(x + 1, y + 1, width), vertex(x, y + 1, width), 2);
      if (x === 0 || !mask[y * width + x - 1]) addEdge(edges, vertex(x, y + 1, width), vertex(x, y, width), 3);
    }
  }
  return edges;
}

function addEdge(edges: BoundaryEdges, start: number, end: number, direction: number): void {
  const index = edges.count;
  edges.start[index] = start;
  edges.end[index] = end;
  edges.direction[index] = direction;
  edges.next[index] = edges.heads[start]!;
  edges.heads[start] = index;
  edges.count += 1;
}

function chooseNextEdge(edges: BoundaryEdges, vertex: number, incomingDirection: number): number {
  const preference = [1, 0, 3, 2];
  let chosen = -1;
  let bestRank = preference.length;
  for (let index = edges.heads[vertex]!; index !== -1; index = edges.next[index]!) {
    if (edges.used[index]) continue;
    const turn = (edges.direction[index]! - incomingDirection + 4) % 4;
    const rank = preference.indexOf(turn);
    if (rank < bestRank) {
      chosen = index;
      bestRank = rank;
    }
  }
  return chosen;
}

function vertex(x: number, y: number, width: number): number {
  return y * (width + 1) + x;
}

function measureClosedPolyline(points: readonly Point[]): number {
  let length = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    length += Math.hypot(next.x - current.x, next.y - current.y);
  }
  return length;
}
