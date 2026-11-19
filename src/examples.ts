import type { Contour, Point } from "./types";

const SAMPLE_COUNT = 720;

export const EXAMPLES = {
  star: createStar,
  shell: createShell,
  petals: createPetals,
} as const;

export type ExampleName = keyof typeof EXAMPLES;

export function createExample(name: ExampleName): Contour[] {
  return EXAMPLES[name]();
}

function createStar(): Contour[] {
  return [closedContour("Soft star", (phase) => {
    const angle = phase * Math.PI * 2;
    const radius = 116 + 30 * Math.cos(5 * angle);
    return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
  })];
}

function createShell(): Contour[] {
  const shell = closedContour("Shell", (phase) => {
    const angle = phase * Math.PI * 2;
    const radial = 90 + 10 * Math.cos(8 * angle);
    return { x: radial * Math.cos(angle) - 10, y: radial * Math.sin(angle) + 8 };
  });
  const spiral: Contour = {
    id: "example-spiral",
    label: "Spiral",
    closed: false,
    source: "example",
    points: Array.from({ length: SAMPLE_COUNT }, (_, index) => {
      const phase = index / (SAMPLE_COUNT - 1);
      const angle = phase * Math.PI * 4.25;
      const radius = 4 + phase * 68;
      return { x: radius * Math.cos(angle) - 10, y: radius * Math.sin(angle) + 8 };
    }),
  };
  return [shell, spiral];
}

function createPetals(): Contour[] {
  return [closedContour("Three petals", (phase) => {
    const angle = phase * Math.PI * 2;
    const radius = 76 + 43 * Math.cos(3 * angle);
    return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
  })];
}

function closedContour(label: string, pointAt: (phase: number) => Point): Contour {
  return {
    id: label.toLowerCase().replaceAll(" ", "-"),
    label,
    points: Array.from({ length: SAMPLE_COUNT }, (_, index) => pointAt(index / SAMPLE_COUNT)),
    closed: true,
    source: "example",
  };
}
