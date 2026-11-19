import { svgPathProperties } from "svg-path-properties";
import type { Contour, Point } from "../types";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const NUMERIC_VALUE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?(?:px)?$/i;
const IGNORED_ELEMENTS = new Set(["defs", "title", "desc", "metadata"]);
const UNSUPPORTED_ELEMENTS = new Set(["style", "linearGradient", "radialGradient", "clipPath", "mask", "filter", "pattern", "marker"]);
const CONTAINER_ELEMENTS = new Set(["svg", "g"]);
const GEOMETRY_ELEMENTS = new Set(["path", "line", "polyline", "polygon", "rect", "circle", "ellipse"]);
const MAX_PATH_DATA_LENGTH = 1_000_000;

type Matrix = [number, number, number, number, number, number];
type PathPart = ReturnType<InstanceType<typeof svgPathProperties>["getParts"]>[number];

interface MeasuredSegment {
  start: Point;
  end: Point;
  length: number;
  at(distance: number): Point;
}

interface SvgSubpathCandidate {
  segments: MeasuredSegment[];
  closed: boolean;
  matrix: Matrix;
  length: number;
}

export interface SvgParseResult {
  contours: Contour[];
  skipped: number;
  omitted: number;
}

export function parseSvgContours(source: string): SvgParseResult {
  if (source.length > 20 * 1024 * 1024) throw new Error("SVG files must be 20 MB or smaller.");
  if (/<!\s*(?:DOCTYPE|ENTITY)/i.test(source)) throw new Error("SVG files with document type declarations are not supported.");

  const document = new DOMParser().parseFromString(source, "image/svg+xml");
  if (document.querySelector("parsererror")) throw new Error("This SVG file could not be parsed.");
  const root = document.documentElement;
  if (root.localName !== "svg" || root.namespaceURI !== SVG_NAMESPACE) {
    throw new Error("The selected file does not contain a valid SVG image.");
  }

  const candidates: SvgSubpathCandidate[] = [];
  let skipped = 0;
  let totalContours = 0;
  const addCandidate = (segments: MeasuredSegment[], closed: boolean, matrix: Matrix): void => {
    const length = measureTransformedLength(segments, closed, matrix);
    if (length <= 0) return;
    totalContours += 1;
    const candidate = { segments, closed, matrix, length };
    candidates.push(candidate);
    candidates.sort((left, right) => right.length - left.length);
    if (candidates.length > 24) candidates.pop();
  };
  visitElement(root, rootViewportMatrix(root), root.getAttribute("fill") ?? "black", (count) => {
    skipped += count;
  }, addCandidate);

  const contours: Contour[] = [];
  for (const [index, candidate] of candidates.entries()) {
    try {
      contours.push({
        id: `svg-${index}`,
        label: `Outline ${index + 1}`,
        points: sampleSubpath(candidate.segments, candidate.closed, candidate.matrix),
        closed: candidate.closed,
        source: "svg",
      });
    } catch {
      skipped += 1;
    }
  }
  const omitted = Math.max(0, totalContours - candidates.length);
  if (contours.length === 0) throw new Error("No supported outlines were found in this SVG.");
  return { contours, skipped, omitted };
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function rootViewportMatrix(root: Element): Matrix {
  const viewBox = root.getAttribute("viewBox");
  if (!viewBox || !/^none(?:\s|$)/i.test(root.getAttribute("preserveAspectRatio") ?? "")) return [...IDENTITY];
  const values = viewBox.trim().split(/[\s,]+/).map((value) => parseNumber(value, 0));
  if (values.length !== 4 || values[2]! <= 0 || values[3]! <= 0) throw new Error("The SVG viewBox is invalid.");
  const viewportWidth = parseNumber(root.getAttribute("width"), 300);
  const viewportHeight = parseNumber(root.getAttribute("height"), 150);
  if (viewportWidth <= 0 || viewportHeight <= 0) throw new Error("The SVG viewport dimensions are invalid.");
  const scaleX = viewportWidth / values[2]!;
  const scaleY = viewportHeight / values[3]!;
  return [scaleX, 0, 0, scaleY, -values[0]! * scaleX, -values[1]! * scaleY];
}

function visitElement(
  element: Element,
  parentMatrix: Matrix,
  inheritedFill: string,
  addSkipped: (count: number) => void,
  addCandidate: (segments: MeasuredSegment[], closed: boolean, matrix: Matrix) => void,
): void {
  if (element.namespaceURI !== SVG_NAMESPACE) {
    addSkipped(1);
    return;
  }

  const name = element.localName;
  if (IGNORED_ELEMENTS.has(name)) return;
  if (UNSUPPORTED_ELEMENTS.has(name)) {
    addSkipped(1);
    return;
  }
  if (!CONTAINER_ELEMENTS.has(name) && !GEOMETRY_ELEMENTS.has(name)) {
    addSkipped(1);
    return;
  }

  let matrix: Matrix;
  try {
    matrix = multiply(parentMatrix, parseTransform(element.getAttribute("transform") ?? ""));
  } catch {
    addSkipped(1);
    return;
  }
  const fillAttribute = element.getAttribute("fill") ?? inlineStyleValue(element.getAttribute("style"), "fill");
  const fill = !fillAttribute || fillAttribute.trim().toLowerCase() === "inherit"
    ? inheritedFill
    : fillAttribute.trim().toLowerCase();

  if (CONTAINER_ELEMENTS.has(name)) {
    for (const child of Array.from(element.children)) {
      visitElement(child, matrix, fill, addSkipped, addCandidate);
    }
    return;
  }

  try {
    const pathData = geometryToPath(element);
    if (pathData.length > MAX_PATH_DATA_LENGTH) throw new Error("SVG path data is too long.");
    const path = new svgPathProperties(pathData);
    const subpaths = groupPathParts(path.getParts());
    if (subpaths.length === 0) throw new Error("The SVG outline is empty.");
    for (const subpath of subpaths) {
      if (!subpath.closed && fill !== "none") {
        const first = subpath.segments[0]!.start;
        const last = subpath.segments.at(-1)!.end;
        const closingLength = Math.hypot(first.x - last.x, first.y - last.y);
        if (closingLength > 1e-9) {
          subpath.segments.push({
            start: last,
            end: first,
            length: closingLength,
            at: (distance) => {
              const ratio = closingLength === 0 ? 0 : distance / closingLength;
              return { x: last.x + (first.x - last.x) * ratio, y: last.y + (first.y - last.y) * ratio };
            },
          });
        }
        subpath.closed = true;
      }
      addCandidate(subpath.segments, subpath.closed, matrix);
    }
  } catch {
    addSkipped(1);
  }
}

function geometryToPath(element: Element): string {
  const value = (name: string, fallback = 0): number => parseNumber(element.getAttribute(name), fallback);
  switch (element.localName) {
    case "path": {
      const data = element.getAttribute("d") ?? "";
      if (!data.trim()) throw new Error("SVG path has no data.");
      return data;
    }
    case "line":
      return `M ${value("x1")} ${value("y1")} L ${value("x2")} ${value("y2")}`;
    case "polyline":
    case "polygon": {
      const numbers = parseCoordinateList(element.getAttribute("points") ?? "");
      if (numbers.length < 4) throw new Error("The SVG points list is incomplete.");
      const path = numbers.reduce((result, number, index) => {
        if (index % 2 === 0) return `${result}${index === 0 ? "M" : " L"} ${number}`;
        return `${result} ${number}`;
      }, "");
      return element.localName === "polygon" ? `${path} Z` : path;
    }
    case "rect": {
      const x = value("x"), y = value("y"), width = value("width"), height = value("height");
      if (width <= 0 || height <= 0) throw new Error("The SVG rectangle has no area.");
      const rx = Math.min(value("rx"), width / 2);
      const ry = Math.min(value("ry", rx), height / 2);
      if (rx <= 0 || ry <= 0) return `M ${x} ${y} h ${width} v ${height} h ${-width} Z`;
      return `M ${x + rx} ${y} H ${x + width - rx} A ${rx} ${ry} 0 0 1 ${x + width} ${y + ry} V ${y + height - ry} A ${rx} ${ry} 0 0 1 ${x + width - rx} ${y + height} H ${x + rx} A ${rx} ${ry} 0 0 1 ${x} ${y + height - ry} V ${y + ry} A ${rx} ${ry} 0 0 1 ${x + rx} ${y} Z`;
    }
    case "circle":
    case "ellipse": {
      const cx = value("cx"), cy = value("cy");
      const rx = element.localName === "circle" ? value("r") : value("rx");
      const ry = element.localName === "circle" ? rx : value("ry");
      if (rx <= 0 || ry <= 0) throw new Error("The SVG ellipse has no area.");
      const kappa = 0.5522847498307936;
      return `M ${cx + rx} ${cy} C ${cx + rx} ${cy + kappa * ry} ${cx + kappa * rx} ${cy + ry} ${cx} ${cy + ry} C ${cx - kappa * rx} ${cy + ry} ${cx - rx} ${cy + kappa * ry} ${cx - rx} ${cy} C ${cx - rx} ${cy - kappa * ry} ${cx - kappa * rx} ${cy - ry} ${cx} ${cy - ry} C ${cx + kappa * rx} ${cy - ry} ${cx + rx} ${cy - kappa * ry} ${cx + rx} ${cy} Z`;
    }
    default:
      throw new Error("Unsupported SVG geometry.");
  }
}

function groupPathParts(parts: PathPart[]): Array<{ segments: MeasuredSegment[]; closed: boolean }> {
  const subpaths: Array<{ segments: MeasuredSegment[]; closed: boolean }> = [];
  let segments: MeasuredSegment[] = [];
  let previous: Point | undefined;

  const finish = (closed: boolean): void => {
    if (segments.length > 0) subpaths.push({ segments, closed });
    segments = [];
    previous = undefined;
  };

  for (const part of parts) {
    if (previous && distance(previous, part.start) > 1e-7) finish(false);
    if (part.length > 0) {
      segments.push({
        start: part.start,
        end: part.end,
        length: part.length,
        at: (distance) => part.getPointAtLength(distance),
      });
    }
    previous = part.end;
    if (part.details[0] === "Z") finish(true);
  }
  finish(false);
  return subpaths;
}

function sampleSubpath(
  segments: readonly MeasuredSegment[],
  closed: boolean,
  matrix: Matrix,
  count = 1024,
): Point[] {
  const length = segments.reduce((total, segment) => total + segment.length, 0);
  if (length <= 0) return [];
  const cumulative = [0];
  for (const segment of segments) cumulative.push(cumulative.at(-1)! + segment.length);
  const points: Point[] = [];

  for (let index = 0; index < count; index += 1) {
    const target = (index / (closed ? count : count - 1)) * length;
    let segmentIndex = 0;
    while (segmentIndex < segments.length - 1 && cumulative[segmentIndex + 1]! <= target) segmentIndex += 1;
    while (segmentIndex < segments.length - 1 && segments[segmentIndex]!.length === 0) segmentIndex += 1;
    const segment = segments[segmentIndex]!;
    const localDistance = Math.max(0, Math.min(segment.length, target - cumulative[segmentIndex]!));
    const sampled = segment.at(localDistance);
    const transformed = apply(matrix, sampled);
    if (!Number.isFinite(transformed.x) || !Number.isFinite(transformed.y)) throw new Error("SVG geometry contains invalid coordinates.");
    points.push(transformed);
  }
  return points;
}

function measureTransformedLength(
  segments: readonly MeasuredSegment[],
  closed: boolean,
  matrix: Matrix,
): number {
  const count = 64;
  const points = sampleSubpath(segments, closed, matrix, count);
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += distance(points[index - 1]!, points[index]!);
  }
  if (closed && points.length > 1) length += distance(points.at(-1)!, points[0]!);
  return length;
}

function parseNumber(value: string | null, fallback: number): number {
  if (value === null || value.trim() === "") return fallback;
  const normalized = value.trim();
  if (!NUMERIC_VALUE.test(normalized)) throw new Error("SVG dimensions must use unitless or pixel values.");
  const number = Number.parseFloat(normalized);
  if (!Number.isFinite(number) || Math.abs(number) > 1_000_000) throw new Error("SVG dimensions are out of range.");
  return number;
}

function inlineStyleValue(style: string | null, property: string): string | null {
  if (!style) return null;
  for (const declaration of style.split(";")) {
    const separator = declaration.indexOf(":");
    if (separator < 0) continue;
    if (declaration.slice(0, separator).trim().toLowerCase() === property) {
      return declaration.slice(separator + 1).trim();
    }
  }
  return null;
}

function parseCoordinateList(value: string): number[] {
  const tokens = value.trim().split(/[\s,]+/).filter(Boolean);
  if (tokens.length > MAX_PATH_DATA_LENGTH / 2 || tokens.some((token) => !NUMERIC_VALUE.test(token))) {
    throw new Error("The SVG points list is invalid.");
  }
  return tokens.map((token) => parseNumber(token, 0));
}

function parseTransform(value: string): Matrix {
  if (!value.trim()) return [...IDENTITY];
  const transformExpression = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let cursor = 0;
  let result: Matrix = [...IDENTITY];
  let match: RegExpExecArray | null;
  while ((match = transformExpression.exec(value))) {
    if (value.slice(cursor, match.index).trim().replaceAll(",", "") !== "") throw new Error("SVG transform is malformed.");
    const args = match[2]!.trim() ? match[2]!.trim().split(/[\s,]+/).map(Number) : [];
    if (args.some((number) => !Number.isFinite(number) || Math.abs(number) > 1_000_000)) throw new Error("SVG transform is out of range.");
    result = multiply(result, transformMatrix(match[1]!, args));
    cursor = transformExpression.lastIndex;
  }
  if (cursor === 0 || value.slice(cursor).trim().replaceAll(",", "") !== "") throw new Error("SVG transform is malformed.");
  return result;
}

function transformMatrix(name: string, args: number[]): Matrix {
  switch (name) {
    case "matrix":
      if (args.length !== 6) break;
      return [args[0]!, args[1]!, args[2]!, args[3]!, args[4]!, args[5]!];
    case "translate":
      if (args.length === 1 || args.length === 2) return [1, 0, 0, 1, args[0]!, args[1] ?? 0];
      break;
    case "scale":
      if (args.length === 1 || args.length === 2) return [args[0]!, 0, 0, args[1] ?? args[0]!, 0, 0];
      break;
    case "rotate": {
      if (args.length !== 1 && args.length !== 3) break;
      const radians = args[0]! * Math.PI / 180;
      const cosine = Math.cos(radians), sine = Math.sin(radians);
      const rotation: Matrix = [cosine, sine, -sine, cosine, 0, 0];
      if (args.length === 1) return rotation;
      return multiply(multiply([1, 0, 0, 1, args[1]!, args[2]!], rotation), [1, 0, 0, 1, -args[1]!, -args[2]!]);
    }
    case "skewX":
      if (args.length === 1) return [1, 0, Math.tan(args[0]! * Math.PI / 180), 1, 0, 0];
      break;
    case "skewY":
      if (args.length === 1) return [1, Math.tan(args[0]! * Math.PI / 180), 0, 1, 0, 0];
      break;
  }
  throw new Error("SVG transform is unsupported.");
}

function multiply(left: Matrix, right: Matrix): Matrix {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ];
}

function apply(matrix: Matrix, point: Point): Point {
  return {
    x: matrix[0] * point.x + matrix[2] * point.y + matrix[4],
    y: matrix[1] * point.x + matrix[3] * point.y + matrix[5],
  };
}

function distance(left: Point, right: Point): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}
