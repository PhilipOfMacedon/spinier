import { describe, expect, it } from "vitest";
import { traceRaster } from "../src/import/raster";
import { measureContour } from "../src/math/contour";

describe("raster contour tracing", () => {
  it("traces a filled dark block as one closed contour", () => {
    const result = traceRaster(raster(7, 7, (x, y) => x >= 2 && x <= 4 && y >= 2 && y <= 4 ? BLACK : WHITE), 128, false);
    expect(result.contours).toHaveLength(1);
    expect(result.contours[0]!.closed).toBe(true);
    expect(result.contours[0]!.points).toEqual([
      { x: 2, y: -2 }, { x: 5, y: -2 }, { x: 5, y: -5 }, { x: 2, y: -5 },
    ]);
  });

  it("keeps the raster's top edge above its bottom edge in complex-plane coordinates", () => {
    const result = traceRaster(raster(7, 7, (x, y) => x === 3 && y >= 1 && y <= 3 ? BLACK : WHITE), 128, false);
    const points = result.contours[0]!.points;
    expect(Math.max(...points.map((point) => point.y))).toBe(-1);
    expect(Math.min(...points.map((point) => point.y))).toBe(-4);
  });

  it("keeps holes and separated shapes as independent contours", () => {
    const result = traceRaster(raster(14, 10, (x, y) => {
      const first = x >= 1 && x <= 6 && y >= 1 && y <= 6 && !(x >= 3 && x <= 4 && y >= 3 && y <= 4);
      const second = x >= 9 && x <= 11 && y >= 3 && y <= 6;
      return first || second ? BLACK : WHITE;
    }), 128, false);
    expect(result.contours).toHaveLength(3);
    expect(result.contours.every((contour) => contour.closed)).toBe(true);
  });

  it("uses alpha for a transparent silhouette", () => {
    const result = traceRaster(raster(5, 5, (x, y) => x >= 1 && x <= 3 && y >= 1 && y <= 3 ? BLACK : TRANSPARENT), 128, false);
    expect(result.transparent).toBe(true);
    expect(result.contours).toHaveLength(1);
  });

  it("inverts opaque luminance masks", () => {
    const source = raster(7, 7, (x, y) => x >= 2 && x <= 4 && y >= 2 && y <= 4 ? BLACK : WHITE);
    const normal = traceRaster(source, 128, false);
    const inverted = traceRaster(source, 128, true);
    expect(normal.contours).toHaveLength(1);
    expect(inverted.contours).toHaveLength(2);
  });

  it("chooses the longest outlines when the contour limit is reached", () => {
    const source = raster(61, 7, (x, y) => {
      const isSinglePixel = x >= 1 && x <= 49 && x % 2 === 1 && y === 3;
      const isLongShape = x >= 55 && x <= 59 && y >= 1 && y <= 5;
      return isSinglePixel || isLongShape ? BLACK : WHITE;
    });
    const result = traceRaster(source, 128, false, 2);
    expect(result.contours).toHaveLength(2);
    expect(measureContour(result.contours[0]!.points, true)).toBeGreaterThan(measureContour(result.contours[1]!.points, true));
    expect(result.omitted).toBe(24);
  });

  it("keeps diagonally touching pixels on separate loops", () => {
    const result = traceRaster(raster(4, 4, (x, y) => (x === 1 && y === 1) || (x === 2 && y === 2) ? BLACK : WHITE), 128, false);
    expect(result.contours).toHaveLength(2);
  });
});

const BLACK: [number, number, number, number] = [0, 0, 0, 255];
const WHITE: [number, number, number, number] = [255, 255, 255, 255];
const TRANSPARENT: [number, number, number, number] = [0, 0, 0, 0];

function raster(
  width: number,
  height: number,
  pixelAt: (x: number, y: number) => [number, number, number, number],
) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) data.set(pixelAt(x, y), (y * width + x) * 4);
  }
  return { width, height, data };
}
