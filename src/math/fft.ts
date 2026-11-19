import { measureContour, resampleContour, SAMPLE_COUNT } from "./contour";
import type { Contour, FourierTerm, Point, ProcessedContour } from "../types";

export function transformReal(samples: readonly number[]): { real: Float64Array; imaginary: Float64Array } {
  const length = samples.length;
  if (length < 2 || (length & (length - 1)) !== 0) {
    throw new Error("The FFT requires a power-of-two sample count.");
  }

  const real = Float64Array.from(samples);
  const imaginary = new Float64Array(length);

  for (let index = 1, reversed = 0; index < length; index += 1) {
    let bit = length >> 1;
    while (reversed & bit) {
      reversed ^= bit;
      bit >>= 1;
    }
    reversed ^= bit;
    if (index < reversed) {
      [real[index], real[reversed]] = [real[reversed]!, real[index]!];
      [imaginary[index], imaginary[reversed]] = [imaginary[reversed]!, imaginary[index]!];
    }
  }

  for (let span = 2; span <= length; span <<= 1) {
    const angle = (-2 * Math.PI) / span;
    const stepReal = Math.cos(angle);
    const stepImaginary = Math.sin(angle);
    const halfSpan = span >> 1;

    for (let start = 0; start < length; start += span) {
      let rotationReal = 1;
      let rotationImaginary = 0;
      for (let offset = 0; offset < halfSpan; offset += 1) {
        const even = start + offset;
        const odd = even + halfSpan;
        const oddReal = real[odd]! * rotationReal - imaginary[odd]! * rotationImaginary;
        const oddImaginary = real[odd]! * rotationImaginary + imaginary[odd]! * rotationReal;
        const evenReal = real[even]!;
        const evenImaginary = imaginary[even]!;

        real[even] = evenReal + oddReal;
        imaginary[even] = evenImaginary + oddImaginary;
        real[odd] = evenReal - oddReal;
        imaginary[odd] = evenImaginary - oddImaginary;

        const nextRotationReal = rotationReal * stepReal - rotationImaginary * stepImaginary;
        rotationImaginary = rotationReal * stepImaginary + rotationImaginary * stepReal;
        rotationReal = nextRotationReal;
      }
    }
  }

  for (let index = 0; index < length; index += 1) {
    real[index] = real[index]! / length;
    imaginary[index] = imaginary[index]! / length;
  }

  return { real, imaginary };
}

export function analyzeContour(contour: Contour): ProcessedContour {
  const length = measureContour(contour.points, contour.closed);
  const samples = resampleContour(contour.points, contour.closed, SAMPLE_COUNT);
  const residuals = contour.closed
    ? samples
    : subtractBaseline(samples, contour.points[0]!, contour.points.at(-1)!);
  const { real, imaginary } = transformComplex(residuals);
  const terms: FourierTerm[] = [];
  const half = SAMPLE_COUNT / 2;

  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const frequency = index <= half ? index : index - SAMPLE_COUNT;
    const term = {
      frequency,
      real: real[index]!,
      imaginary: imaginary[index]!,
      magnitude: Math.hypot(real[index]!, imaginary[index]!),
    };
    if (frequency === 0) terms.unshift(term);
    else terms.push(term);
  }

  const center = terms[0]!;
  const ranked = terms.slice(1).sort((left, right) => right.magnitude - left.magnitude);
  return { ...contour, length, terms: [center, ...ranked] };
}

export function evaluateContour(
  contour: ProcessedContour,
  phase: number,
  harmonicCount: number,
): Point {
  const terms = selectTerms(contour, harmonicCount);
  let real = 0;
  let imaginary = 0;
  for (const term of terms) {
    const angle = 2 * Math.PI * term.frequency * phase;
    real += term.real * Math.cos(angle) - term.imaginary * Math.sin(angle);
    imaginary += term.real * Math.sin(angle) + term.imaginary * Math.cos(angle);
  }

  if (!contour.closed) {
    const start = contour.points[0]!;
    const end = contour.points.at(-1)!;
    const startValue = evaluateTerms(terms, 0);
    real += start.x + (end.x - start.x) * phase - startValue.x;
    imaginary += start.y + (end.y - start.y) * phase - startValue.y;
  }

  return { x: real, y: imaginary };
}

export function selectTerms(contour: ProcessedContour, harmonicCount: number): FourierTerm[] {
  const rotatingCount = Math.max(1, Math.min(harmonicCount, contour.terms.length - 1));
  return [contour.terms[0]!, ...contour.terms.slice(1, rotatingCount + 1)];
}

export function traceAtPhase(
  contours: readonly ProcessedContour[],
  phase: number,
  harmonicCount: number,
  steps = 160,
): Point[][] {
  return contours.map((contour) => {
    const lastStep = contour.closed ? steps - 1 : steps;
    const count = Math.max(2, Math.ceil(lastStep * Math.max(0, Math.min(phase, 1))) + 1);
    return Array.from({ length: count }, (_, index) => {
      const t = phase === 0 ? 0 : Math.min(phase, 1) * index / (count - 1);
      return evaluateContour(contour, t, harmonicCount);
    });
  });
}

function subtractBaseline(samples: readonly Point[], start: Point, end: Point): Point[] {
  return samples.map((point, index) => {
    const phase = index / SAMPLE_COUNT;
    return {
      x: point.x - (start.x + (end.x - start.x) * phase),
      y: point.y - (start.y + (end.y - start.y) * phase),
    };
  });
}

function transformComplex(samples: readonly Point[]): { real: Float64Array; imaginary: Float64Array } {
  const realTransform = transformReal(samples.map((point) => point.x));
  const imaginaryTransform = transformReal(samples.map((point) => point.y));
  const real = new Float64Array(samples.length);
  const imaginary = new Float64Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    real[index] = realTransform.real[index]! - imaginaryTransform.imaginary[index]!;
    imaginary[index] = realTransform.imaginary[index]! + imaginaryTransform.real[index]!;
  }
  return { real, imaginary };
}

function evaluateTerms(terms: readonly FourierTerm[], phase: number): Point {
  let real = 0;
  let imaginary = 0;
  for (const term of terms) {
    const angle = 2 * Math.PI * term.frequency * phase;
    real += term.real * Math.cos(angle) - term.imaginary * Math.sin(angle);
    imaginary += term.real * Math.sin(angle) + term.imaginary * Math.cos(angle);
  }
  return { x: real, y: imaginary };
}
