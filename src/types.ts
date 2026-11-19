export interface Point {
  x: number;
  y: number;
}

export interface Contour {
  id: string;
  label: string;
  points: Point[];
  closed: boolean;
  source: "svg" | "raster" | "example";
}

export interface FourierTerm {
  frequency: number;
  real: number;
  imaginary: number;
  magnitude: number;
}

export interface ProcessedContour extends Contour {
  terms: FourierTerm[];
  length: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ProcessedDrawing {
  contours: ProcessedContour[];
  bounds: Bounds;
  skipped: number;
  omitted: number;
}
