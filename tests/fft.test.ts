import { describe, expect, it } from "vitest";
import { analyzeContour, evaluateContour, transformReal } from "../src/math/fft";
import { resampleContour, SAMPLE_COUNT } from "../src/math/contour";
import type { Contour, Point } from "../src/types";

describe("Fourier analysis", () => {
  it("finds the single rotating coefficient of a unit circle", () => {
    const contour = circleContour(512);
    const result = analyzeContour(contour);
    const strongest = result.terms[1]!;

    expect(strongest.frequency).toBe(1);
    expect(strongest.magnitude).toBeCloseTo(1, 4);
    expect(evaluateContour(result, 0, 1).x).toBeCloseTo(1, 4);
    expect(evaluateContour(result, 0.25, 1).y).toBeCloseTo(1, 4);
  });

  it("reconstructs an asymmetric closed outline when all terms are retained", () => {
    const contour: Contour = {
      id: "asymmetric",
      label: "Asymmetric",
      source: "example",
      closed: true,
      points: [
        { x: -2, y: 0 }, { x: -1, y: -1 }, { x: 0, y: -1.5 },
        { x: 2, y: -0.5 }, { x: 1.5, y: 1 }, { x: 0, y: 2 },
      ],
    };
    const result = analyzeContour(contour);
    const sampledPoints = resampleContour(contour.points, true, SAMPLE_COUNT);
    const maxError = sampledPoints.reduce((maximum, point, index) => {
      const phase = index / SAMPLE_COUNT;
      const reconstructed = evaluateContour(result, phase, 1024);
      return Math.max(maximum, Math.hypot(reconstructed.x - point.x, reconstructed.y - point.y));
    }, 0);
    expect(maxError).toBeLessThan(0.01);
  });

  it("preserves both endpoints of an open stroke after truncation", () => {
    const contour: Contour = {
      id: "open",
      label: "Open stroke",
      source: "example",
      closed: false,
      points: Array.from({ length: 40 }, (_, index) => {
        const phase = index / 39;
        return { x: 7 + 30 * phase, y: -3 + 14 * Math.sin(Math.PI * phase) };
      }),
    };
    const result = analyzeContour(contour);
    const first = evaluateContour(result, 0, 4);
    const last = evaluateContour(result, 1, 4);
    expect(first.x).toBeCloseTo(7, 10);
    expect(first.y).toBeCloseTo(-3, 10);
    expect(last.x).toBeCloseTo(37, 10);
    expect(last.y).toBeCloseTo(-3, 10);
  });

  it("rejects a sample length that the radix-two FFT cannot process", () => {
    expect(() => transformReal([1, 2, 3])).toThrow(/power-of-two/);
  });
});

function circleContour(count: number): Contour {
  const points: Point[] = Array.from({ length: count }, (_, index) => {
    const phase = index * Math.PI * 2 / count;
    return { x: Math.cos(phase), y: Math.sin(phase) };
  });
  return { id: "circle", label: "Circle", source: "example", points, closed: true };
}
