import { beforeEach, describe, expect, it } from "vitest";
import { parseSvgContours } from "../src/import/svg";

beforeEach(() => {
  document.body.replaceChildren();
});

describe("safe SVG contour extraction", () => {
  it("preserves compound paths, implicit fill closure, and nested transforms", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><g transform="translate(10 5)"><g transform="scale(2)"><path fill="none" d="M0 0 L10 0 L10 10 Z M20 20 L25 20"/></g></g></svg>`;
    const result = parseSvgContours(svg);
    expect(result.contours).toHaveLength(2);
    const closed = result.contours.find((contour) => contour.closed)!;
    const open = result.contours.find((contour) => !contour.closed)!;
    expect(closed.points[0]).toEqual({ x: 10, y: -5 });
    expect(open.points[0]).toEqual({ x: 50, y: -45 });
    expect(open.points.at(-1)!.x).toBeCloseTo(60, 5);
    expect(open.points.at(-1)!.y).toBeCloseTo(-45, 5);
  });

  it("maps SVG screen y downward into negative imaginary coordinates", () => {
    const result = parseSvgContours(`<svg xmlns="http://www.w3.org/2000/svg"><path fill="none" d="M3 4 L3 18"/></svg>`);
    const contour = result.contours[0]!;
    expect(contour.points[0]!.y).toBeCloseTo(-4, 5);
    expect(contour.points.at(-1)!.y).toBeCloseTo(-18, 5);
  });

  it("closes an unclosed path that uses the default SVG fill", () => {
    const result = parseSvgContours(`<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 H20 V20"/></svg>`);
    expect(result.contours).toHaveLength(1);
    expect(result.contours[0]!.closed).toBe(true);
  });

  it("respects a safe inline fill declaration when identifying open strokes", () => {
    const result = parseSvgContours(`<svg xmlns="http://www.w3.org/2000/svg"><path style="fill: none; stroke: #111" d="M0 0 H20"/></svg>`);
    expect(result.contours[0]!.closed).toBe(false);
  });

  it("converts basic shapes and reports unsupported active elements", () => {
    const result = parseSvgContours(`<svg xmlns="http://www.w3.org/2000/svg"><rect x="1" y="2" width="20" height="10"/><circle cx="40" cy="40" r="8"/><text>ignored text</text></svg>`);
    expect(result.contours).toHaveLength(2);
    expect(result.skipped).toBe(1);
  });

  it("rejects malformed markup, document declarations, and files without usable outlines", () => {
    expect(() => parseSvgContours(`<svg><path`)).toThrow(/parsed/);
    expect(() => parseSvgContours(`<!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg"/>`)).toThrow(/declarations/);
    expect(() => parseSvgContours(`<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>`)).toThrow(/No supported outlines/);
  });

  it("ignores embedded links without requesting them", () => {
    const result = parseSvgContours(`<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.invalid/a.png"/><path d="M0 0 L1 0" fill="none"/></svg>`);
    expect(result.contours).toHaveLength(1);
    expect(result.skipped).toBe(1);
  });

  it("retains the longest supported contours and reports omissions", () => {
    const paths = Array.from({ length: 27 }, (_, index) => {
      const size = index + 1;
      return `<path fill="none" d="M${index * 40} 0 h${size} v${size} h-${size} Z"/>`;
    }).join("");
    const result = parseSvgContours(`<svg xmlns="http://www.w3.org/2000/svg">${paths}</svg>`);
    expect(result.contours).toHaveLength(24);
    expect(result.omitted).toBe(3);
    expect(result.contours[0]!.points.some((point) => point.x >= 26 * 40)).toBe(true);
  });

  it("ranks contours after applying their transforms", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><path fill="none" d="M0 0 H20"/><path transform="scale(8 1)" fill="none" d="M0 10 H5"/></svg>`;
    const result = parseSvgContours(svg);
    expect(result.contours).toHaveLength(2);
    expect(result.contours[0]!.points.at(-1)!.x - result.contours[0]!.points[0]!.x).toBeCloseTo(40, 2);
  });

  it("preserves nonuniform scaling requested by the SVG viewBox", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 100 100" preserveAspectRatio="none"><rect width="40" height="40"/></svg>`;
    const contour = parseSvgContours(svg).contours[0]!;
    const bounds = {
      width: Math.max(...contour.points.map((point) => point.x)) - Math.min(...contour.points.map((point) => point.x)),
      height: Math.max(...contour.points.map((point) => point.y)) - Math.min(...contour.points.map((point) => point.y)),
    };
    expect(bounds.width).toBeCloseTo(80, 1);
    expect(bounds.height).toBeCloseTo(40, 1);
  });
});
