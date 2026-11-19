import { evaluateContour, selectTerms } from "../math/fft";
import type { Bounds, Point, ProcessedContour, ProcessedDrawing } from "../types";

export interface CanvasSettings {
  harmonics: number;
  fade: number;
  showOrbits: boolean;
  showSource: boolean;
  showGrid: boolean;
}

const COLORS = {
  background: "#0d121b",
  grid: "#1a2433",
  axes: "#344358",
  source: "#74839a",
  orbit: "#637d99",
  trace: "#b5f286",
  tip: "#d0ffad",
};

export class EpicycleCanvas {
  private readonly context: CanvasRenderingContext2D;
  private readonly trailCanvas = document.createElement("canvas");
  private readonly trailContext: CanvasRenderingContext2D;
  private drawing: ProcessedDrawing | null = null;
  private bounds: Bounds | null = null;
  private settings: CanvasSettings = {
    harmonics: 8,
    fade: 36,
    showOrbits: true,
    showSource: true,
    showGrid: true,
  };
  private phase = 0;
  private previousPhase = 0;
  private hasPhase = false;
  private pixelWidth = 0;
  private pixelHeight = 0;
  private pixelRatio = 1;
  private layout = { centerX: 0, centerY: 0, scale: 1, width: 0, height: 0 };

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");
    const trailContext = this.trailCanvas.getContext("2d");
    if (!context || !trailContext) throw new Error("Canvas 2D is unavailable in this browser.");
    this.context = context;
    this.trailContext = trailContext;
  }

  setDrawing(drawing: ProcessedDrawing, phase = this.phase): void {
    this.drawing = drawing;
    this.bounds = drawing.bounds;
    this.phase = phase;
    this.previousPhase = phase;
    this.hasPhase = false;
    this.renderStatic();
    this.rebuildTrail(phase);
    this.paint();
  }

  setSettings(settings: CanvasSettings): void {
    const pathChanged = settings.harmonics !== this.settings.harmonics;
    this.settings = { ...settings };
    if (pathChanged) this.rebuildTrail(this.phase);
    this.renderStatic();
    this.paint();
  }

  setPhase(phase: number): void {
    this.phase = clamp(phase, 0, 1);
    this.previousPhase = this.phase;
    this.hasPhase = true;
    this.rebuildTrail(this.phase);
    this.renderStatic();
    this.paint();
  }

  renderFrame(phase: number, elapsedMs: number, playing: boolean): void {
    this.phase = phase;
    if (this.resizeCanvas()) this.hasPhase = false;
    if (this.drawing && this.bounds && !this.hasPhase) {
      this.rebuildTrail(this.phase);
      this.hasPhase = true;
    } else if (this.drawing && playing && this.hasPhase) {
      this.fadeTrail(elapsedMs);
      this.advanceTrail(this.previousPhase, phase);
    }
    this.previousPhase = phase;
    this.renderStatic();
    this.paint();
  }

  private resizeCanvas(): boolean {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (!width || !height) return false;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    const changed = pixelWidth !== this.pixelWidth || pixelHeight !== this.pixelHeight || ratio !== this.pixelRatio;
    if (!changed) return false;

    this.pixelWidth = pixelWidth;
    this.pixelHeight = pixelHeight;
    this.pixelRatio = ratio;
    this.canvas.width = pixelWidth;
    this.canvas.height = pixelHeight;
    this.trailCanvas.width = pixelWidth;
    this.trailCanvas.height = pixelHeight;
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.trailContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.layout.width = width;
    this.layout.height = height;
    return true;
  }

  private renderStatic(): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (!width || !height) return;
    if (this.pixelWidth === 0) this.resizeCanvas();
    this.context.clearRect(0, 0, width, height);
    this.layout = { ...this.layout, width, height, centerX: width / 2, centerY: height / 2 };
    if (this.settings.showGrid) this.drawGrid();
    if (!this.drawing || !this.bounds) return;
    this.layout.scale = this.getScale(width, height);
    if (this.settings.showSource) this.drawSourceOutlines();
    if (this.settings.showOrbits) this.drawEpicycles();
  }

  private getScale(width: number, height: number): number {
    if (!this.drawing || !this.bounds) return 1;
    const origin = { x: (this.bounds.minX + this.bounds.maxX) / 2, y: (this.bounds.minY + this.bounds.maxY) / 2 };
    const boundsReach = Math.max(this.bounds.maxX - this.bounds.minX, this.bounds.maxY - this.bounds.minY) / 2;
    let maximumReach = boundsReach;
    for (const contour of this.drawing.contours) {
      const terms = selectTerms(contour, this.settings.harmonics);
      const center = terms[0]!;
      const centerOffset = Math.hypot(center.real - origin.x, center.imaginary - origin.y);
      const radius = terms.slice(1).reduce((total, term) => total + term.magnitude, 0);
      const openOffset = contour.closed ? 0 : Math.max(
        Math.hypot(contour.points[0]!.x - origin.x, contour.points[0]!.y - origin.y),
        Math.hypot(contour.points.at(-1)!.x - origin.x, contour.points.at(-1)!.y - origin.y),
      );
      const chainReach = contour.closed
        ? centerOffset + radius
        : openOffset + centerOffset + radius * 2;
      maximumReach = Math.max(maximumReach, chainReach);
    }
    const available = Math.max(40, Math.min(width, height) - 150);
    return available / Math.max(1e-6, maximumReach * 2);
  }

  private drawGrid(): void {
    const { width, height, centerX, centerY } = this.layout;
    const spacing = 44;
    const context = this.context;
    context.beginPath();
    for (let x = centerX % spacing; x < width; x += spacing) {
      context.moveTo(x, 0);
      context.lineTo(x, height);
    }
    for (let y = centerY % spacing; y < height; y += spacing) {
      context.moveTo(0, y);
      context.lineTo(width, y);
    }
    context.strokeStyle = COLORS.grid;
    context.lineWidth = 1;
    context.stroke();
    context.beginPath();
    context.moveTo(0, centerY);
    context.lineTo(width, centerY);
    context.moveTo(centerX, 0);
    context.lineTo(centerX, height);
    context.strokeStyle = COLORS.axes;
    context.stroke();
  }

  private drawSourceOutlines(): void {
    if (!this.drawing) return;
    const context = this.context;
    context.beginPath();
    for (const contour of this.drawing.contours) {
      const first = contour.points[0];
      if (!first) continue;
      const start = this.toScreen(first);
      context.moveTo(start.x, start.y);
      for (let index = 1; index < contour.points.length; index += 1) {
        const point = this.toScreen(contour.points[index]!);
        context.lineTo(point.x, point.y);
      }
      if (contour.closed) context.closePath();
    }
    context.strokeStyle = COLORS.source;
    context.globalAlpha = 0.56;
    context.setLineDash([3, 5]);
    context.lineWidth = 1;
    context.stroke();
    context.setLineDash([]);
    context.globalAlpha = 1;
  }

  private drawEpicycles(): void {
    if (!this.drawing) return;
    const context = this.context;
    context.lineWidth = 1;
    for (const contour of this.drawing.contours) {
      const terms = selectTerms(contour, this.settings.harmonics);
      let point: Point = contour.closed ? { x: 0, y: 0 } : this.openChainBase(contour, terms, this.phase);
      for (const term of terms) {
        const angle = 2 * Math.PI * term.frequency * this.phase;
        const vector = {
          x: term.real * Math.cos(angle) - term.imaginary * Math.sin(angle),
          y: term.real * Math.sin(angle) + term.imaginary * Math.cos(angle),
        };
        const center = this.toScreen(point);
        const tip = this.toScreen({ x: point.x + vector.x, y: point.y + vector.y });
        if (term.frequency !== 0 && term.magnitude * this.layout.scale > 1.5) {
          context.beginPath();
          context.arc(center.x, center.y, term.magnitude * this.layout.scale, 0, Math.PI * 2);
          context.strokeStyle = COLORS.orbit;
          context.globalAlpha = 0.43;
          context.stroke();
        }
        context.beginPath();
        context.moveTo(center.x, center.y);
        context.lineTo(tip.x, tip.y);
        context.strokeStyle = COLORS.orbit;
        context.globalAlpha = 0.85;
        context.lineWidth = 1.2;
        context.stroke();
        point = { x: point.x + vector.x, y: point.y + vector.y };
      }
      const tip = this.toScreen(point);
      context.beginPath();
      context.arc(tip.x, tip.y, 3.2, 0, Math.PI * 2);
      context.fillStyle = COLORS.tip;
      context.globalAlpha = 1;
      context.fill();
    }
  }

  private openChainBase(contour: ProcessedContour, terms: ReturnType<typeof selectTerms>, phase: number): Point {
    const start = contour.points[0]!;
    const end = contour.points.at(-1)!;
    let startReal = 0;
    let startImaginary = 0;
    for (const term of terms) {
      startReal += term.real;
      startImaginary += term.imaginary;
    }
    return {
      x: start.x + (end.x - start.x) * phase - startReal,
      y: start.y + (end.y - start.y) * phase - startImaginary,
    };
  }

  private rebuildTrail(phase: number): void {
    if (!this.drawing || !this.bounds) return;
    this.resizeCanvas();
    this.trailContext.clearRect(0, 0, this.layout.width, this.layout.height);
    this.layout.scale = this.getScale(this.layout.width, this.layout.height);
    if (phase > 0) {
      for (const contour of this.drawing.contours) {
        this.drawTraceRange(contour, 0, phase);
      }
    }
    this.previousPhase = phase;
    this.hasPhase = true;
  }

  private fadeTrail(elapsedMs: number): void {
    if (this.settings.fade <= 0) return;
    const alpha = 1 - Math.exp(-(this.settings.fade / 100) * Math.min(elapsedMs, 100) / 260);
    this.trailContext.save();
    this.trailContext.globalCompositeOperation = "destination-out";
    this.trailContext.globalAlpha = alpha;
    this.trailContext.fillStyle = "#000";
    this.trailContext.fillRect(0, 0, this.layout.width, this.layout.height);
    this.trailContext.restore();
  }

  private advanceTrail(previousPhase: number, phase: number): void {
    if (!this.drawing) return;
    if (phase < previousPhase) {
      for (const contour of this.drawing.contours) {
        this.drawTraceRange(contour, previousPhase, 1);
        this.drawTraceRange(contour, 0, phase);
      }
      return;
    }
    for (const contour of this.drawing.contours) this.drawTraceRange(contour, previousPhase, phase);
  }

  private drawTraceRange(contour: ProcessedContour, start: number, end: number): void {
    if (end <= start || !this.drawing) return;
    const steps = Math.max(1, Math.ceil((end - start) * 512));
    const context = this.trailContext;
    context.beginPath();
    const first = this.toScreen(evaluateContour(contour, start, this.settings.harmonics));
    context.moveTo(first.x, first.y);
    for (let index = 1; index <= steps; index += 1) {
      const phase = start + (end - start) * index / steps;
      const point = this.toScreen(evaluateContour(contour, phase, this.settings.harmonics));
      context.lineTo(point.x, point.y);
    }
    context.strokeStyle = COLORS.trace;
    context.lineWidth = 2;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.globalAlpha = 1;
    context.stroke();
  }

  private paint(): void {
    if (!this.pixelWidth || !this.pixelHeight) return;
    this.context.drawImage(this.trailCanvas, 0, 0, this.layout.width, this.layout.height);
  }

  private toScreen(point: Point): Point {
    return {
      x: this.layout.centerX + (point.x - (this.bounds ? (this.bounds.minX + this.bounds.maxX) / 2 : 0)) * this.layout.scale,
      y: this.layout.centerY - (point.y - (this.bounds ? (this.bounds.minY + this.bounds.maxY) / 2 : 0)) * this.layout.scale,
    };
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
