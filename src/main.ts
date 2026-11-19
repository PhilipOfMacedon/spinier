import { imageSize } from "image-size";
import { createExample, type ExampleName } from "./examples";
import { processContours } from "./import/process";
import { parseSvgContours } from "./import/svg";
import { EpicycleCanvas, type CanvasSettings } from "./render/epicycle-canvas";
import type { ProcessedDrawing } from "./types";
import type { ProcessorRequest, ProcessorResponse } from "./workers/protocol";
import "./styles.css";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_RASTER_SIDE = 512;
const EXAMPLE_LABELS: Record<ExampleName, string> = {
  star: "Soft star",
  shell: "Spiral shell",
  petals: "Three petals",
};

interface RasterSource {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  fileName: string;
  transparent: boolean;
}

interface PendingContext {
  fileName: string;
  raster?: RasterSource;
}

const canvas = element<HTMLCanvasElement>("plot-canvas");
const renderer = new EpicycleCanvas(canvas);
const fileInput = element<HTMLInputElement>("file-input");
const exampleSelect = element<HTMLSelectElement>("example-select");
const phaseSlider = element<HTMLInputElement>("phase-slider");
const phaseValue = element<HTMLOutputElement>("phase-value");
const playButton = element<HTMLButtonElement>("play-button");
const statusLine = element<HTMLDivElement>("status-line");
const importDetail = element<HTMLParagraphElement>("import-detail");
const thresholdSlider = element<HTMLInputElement>("threshold-slider");
const thresholdValue = element<HTMLOutputElement>("threshold-value");
const invertToggle = element<HTMLInputElement>("invert-toggle");
const contourCount = element<HTMLSpanElement>("contour-count");
const harmonicsSlider = element<HTMLInputElement>("harmonics-slider");
const harmonicsValue = element<HTMLOutputElement>("harmonics-value");
const speedSlider = element<HTMLInputElement>("speed-slider");
const speedValue = element<HTMLOutputElement>("speed-value");
const fadeSlider = element<HTMLInputElement>("fade-slider");
const fadeValue = element<HTMLOutputElement>("fade-value");
const orbitsToggle = element<HTMLInputElement>("orbits-toggle");
const sourceToggle = element<HTMLInputElement>("source-toggle");
const gridToggle = element<HTMLInputElement>("grid-toggle");
const pointReadout = element<HTMLSpanElement>("point-readout");
const plotFrame = element<HTMLDivElement>("plot-frame");
const dropHint = element<HTMLDivElement>("drop-hint");

const worker = new Worker(new URL("./workers/processor.worker.ts", import.meta.url), { type: "module" });
let drawing: ProcessedDrawing;
let phase = 0.64;
let playing = false;
let lastFrameTime = 0;
let requestId = 0;
let pendingContext: PendingContext | null = null;
let currentRaster: RasterSource | null = null;
let thresholdTimer = 0;
let customOption: HTMLOptionElement | null = null;
let activeFileName = "";

const settings: CanvasSettings = {
  harmonics: Number(harmonicsSlider.value),
  fade: Number(fadeSlider.value),
  showOrbits: orbitsToggle.checked,
  showSource: sourceToggle.checked,
  showGrid: gridToggle.checked,
};

setDrawing(processContours(createExample("star")));
setPhase(phase);
updateControls();
updateRasterControls();
requestAnimationFrame(renderLoop);

worker.addEventListener("message", (event: MessageEvent<ProcessorResponse>) => {
  const response = event.data;
  if (response.requestId !== requestId || !pendingContext) return;
  const context = pendingContext;
  pendingContext = null;
  if (!response.ok) {
    setImportError(response.error);
    updateRasterControls();
    return;
  }

  drawing = response.drawing;
  currentRaster = context.raster ? { ...context.raster, transparent: response.transparent ?? false } : null;
  activeFileName = context.fileName;
  selectCustomImage(context.fileName);
  updateStatusSummary(context.fileName, response.drawing);
  renderer.setDrawing(drawing, phase);
  updateRasterControls();
  updateContourCount(response.drawing.contours.length);
  showDetails(response.drawing.skipped, response.drawing.omitted, response.transparent ?? false);
});

worker.addEventListener("error", () => {
  pendingContext = null;
  setImportError("The image processor stopped unexpectedly. Your current drawing is still available.");
  updateRasterControls();
});

element<HTMLButtonElement>("open-file").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) void openFile(file);
  fileInput.value = "";
});

exampleSelect.addEventListener("change", () => {
  const name = exampleSelect.value as ExampleName;
  if (!(name in EXAMPLE_LABELS)) return;
  requestId += 1;
  pendingContext = null;
  window.clearTimeout(thresholdTimer);
  pause();
  currentRaster = null;
  activeFileName = "";
  setPhase(0.64);
  setDrawing(processContours(createExample(name)));
  updateRasterControls();
  updateStatusSummary(EXAMPLE_LABELS[name], drawing);
  updateContourCount(drawing.contours.length);
  showDetails(0, 0, false);
});

playButton.addEventListener("click", () => {
  if (playing) pause();
  else play();
});

phaseSlider.addEventListener("input", () => {
  pause();
  setPhase(Number(phaseSlider.value) / 1000);
  renderer.setPhase(phase);
});

harmonicsSlider.addEventListener("input", () => {
  settings.harmonics = Number(harmonicsSlider.value);
  updateControls();
  renderer.setSettings(settings);
});

speedSlider.addEventListener("input", updateControls);

fadeSlider.addEventListener("input", () => {
  settings.fade = Number(fadeSlider.value);
  updateControls();
  renderer.setSettings(settings);
});

orbitsToggle.addEventListener("change", () => {
  settings.showOrbits = orbitsToggle.checked;
  renderer.setSettings(settings);
});

sourceToggle.addEventListener("change", () => {
  settings.showSource = sourceToggle.checked;
  renderer.setSettings(settings);
});

gridToggle.addEventListener("change", () => {
  settings.showGrid = gridToggle.checked;
  renderer.setSettings(settings);
});

thresholdSlider.addEventListener("input", () => {
  thresholdValue.value = thresholdSlider.value;
  scheduleRasterUpdate();
});

invertToggle.addEventListener("change", scheduleRasterUpdate);

element<HTMLButtonElement>("reset-view").addEventListener("click", () => {
  pause();
  setPhase(0.64);
  harmonicsSlider.value = "8";
  speedSlider.value = "1";
  fadeSlider.value = "36";
  orbitsToggle.checked = true;
  sourceToggle.checked = true;
  gridToggle.checked = true;
  settings.harmonics = 8;
  settings.fade = 36;
  settings.showOrbits = true;
  settings.showSource = true;
  settings.showGrid = true;
  if (activeFileName) {
    renderer.setSettings(settings);
    renderer.setPhase(phase);
    updateControls();
    return;
  }
  const name = exampleSelect.value as ExampleName;
  setDrawing(processContours(createExample(name)));
  updateControls();
});

const resizeObserver = new ResizeObserver(() => renderer.renderFrame(phase, 0, false));
resizeObserver.observe(plotFrame);

document.addEventListener("visibilitychange", () => {
  lastFrameTime = 0;
  if (document.hidden) renderer.renderFrame(phase, 0, false);
});

for (const eventName of ["dragenter", "dragover"]) {
  plotFrame.addEventListener(eventName, (event) => {
    event.preventDefault();
    plotFrame.classList.add("is-dragging");
    dropHint.hidden = false;
  });
}

for (const eventName of ["dragleave", "drop"]) {
  plotFrame.addEventListener(eventName, (event) => {
    event.preventDefault();
    plotFrame.classList.remove("is-dragging");
    dropHint.hidden = true;
  });
}

plotFrame.addEventListener("drop", (event) => {
  const file = (event as DragEvent).dataTransfer?.files[0];
  if (file) void openFile(file);
});

function element<T extends HTMLElement>(id: string): T {
  const match = document.getElementById(id);
  if (!match) throw new Error(`Missing required interface element: ${id}`);
  return match as T;
}

function setDrawing(nextDrawing: ProcessedDrawing): void {
  drawing = nextDrawing;
  renderer.setDrawing(drawing, phase);
}

function setPhase(nextPhase: number): void {
  phase = Math.max(0, Math.min(1, nextPhase));
  phaseSlider.value = String(Math.round(phase * 1000));
  phaseValue.value = `${Math.round(phase * 100)}%`;
  pointReadout.textContent = `t = ${phase.toFixed(3)}`;
}

function play(): void {
  playing = true;
  lastFrameTime = 0;
  playButton.classList.add("is-playing");
  playButton.setAttribute("aria-label", "Pause animation");
}

function pause(): void {
  playing = false;
  lastFrameTime = 0;
  playButton.classList.remove("is-playing");
  playButton.setAttribute("aria-label", "Play animation");
}

function renderLoop(timestamp: number): void {
  if (playing && !document.hidden) {
    const elapsed = lastFrameTime === 0 ? 0 : Math.min(timestamp - lastFrameTime, 100);
    if (elapsed > 0) setPhase((phase + elapsed * Number(speedSlider.value) / 8000) % 1);
    renderer.renderFrame(phase, elapsed, true);
    lastFrameTime = timestamp;
  } else {
    renderer.renderFrame(phase, 0, false);
  }
  requestAnimationFrame(renderLoop);
}

function updateControls(): void {
  harmonicsValue.value = harmonicsSlider.value;
  speedValue.value = `${Number(speedSlider.value).toFixed(Number(speedSlider.value) % 1 === 0 ? 0 : 2).replace(/0+$/, "").replace(/\.$/, "")}×`;
  fadeValue.value = `${fadeSlider.value}%`;
  thresholdValue.value = thresholdSlider.value;
}

async function openFile(file: File): Promise<void> {
  const currentRequest = ++requestId;
  pendingContext = null;
  window.clearTimeout(thresholdTimer);
  if (file.size > MAX_FILE_SIZE) {
    setImportError("Choose a file that is 20 MB or smaller.");
    updateRasterControls();
    return;
  }
  if (file.size === 0) {
    setImportError("This file is empty. Choose another image.");
    updateRasterControls();
    return;
  }

  pendingContext = { fileName: file.name };
  statusLine.textContent = `Reading ${file.name}…`;
  statusLine.classList.remove("is-error");
  updateRasterControls();

  try {
    if (isSvgFile(file) || await containsSvgMarkup(file)) {
      const source = await file.text();
      if (currentRequest !== requestId) return;
      const parsed = parseSvgContours(source);
      const request: ProcessorRequest = {
        requestId: currentRequest,
        kind: "contours",
        contours: parsed.contours,
        skipped: parsed.skipped,
        omitted: parsed.omitted,
      };
      worker.postMessage(request);
      return;
    }

    const raster = await decodeRaster(file);
    if (currentRequest !== requestId) return;
    pendingContext = { fileName: file.name, raster };
    sendRasterRequest(currentRequest, raster, Number(thresholdSlider.value), invertToggle.checked);
  } catch (error) {
    if (currentRequest !== requestId) return;
    pendingContext = null;
    setImportError(error instanceof Error ? error.message : "This image could not be opened.");
    updateRasterControls();
  }
}

function isSvgFile(file: File): boolean {
  return file.type.toLowerCase() === "image/svg+xml" || /\.svg$/i.test(file.name);
}

async function containsSvgMarkup(file: File): Promise<boolean> {
  const prefix = await file.slice(0, 4096).text();
  return /<svg(?:\s|>)/i.test(prefix);
}

async function decodeRaster(file: File): Promise<RasterSource> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let width: number;
  let height: number;
  try {
    ({ width, height } = imageSize(bytes));
  } catch {
    throw new Error("This raster format could not be read by the browser.");
  }
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("The image dimensions are invalid.");
  }

  const initialScale = Math.min(1, MAX_RASTER_SIDE / Math.max(width, height));
  const bitmap = await createImageBitmap(file, {
    resizeWidth: Math.max(1, Math.round(width * initialScale)),
    resizeHeight: Math.max(1, Math.round(height * initialScale)),
    resizeQuality: "high",
    imageOrientation: "from-image",
  });
  try {
    const scale = Math.min(1, MAX_RASTER_SIDE / Math.max(bitmap.width, bitmap.height));
    const outputWidth = Math.max(1, Math.round(bitmap.width * scale));
    const outputHeight = Math.max(1, Math.round(bitmap.height * scale));
    const offscreen = document.createElement("canvas");
    offscreen.width = outputWidth;
    offscreen.height = outputHeight;
    const context = offscreen.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("This browser could not read the image pixels.");
    context.clearRect(0, 0, outputWidth, outputHeight);
    context.drawImage(bitmap, 0, 0, outputWidth, outputHeight);
    const pixels = context.getImageData(0, 0, outputWidth, outputHeight).data;
    return { width: outputWidth, height: outputHeight, pixels: new Uint8ClampedArray(pixels), fileName: file.name, transparent: false };
  } finally {
    bitmap.close();
  }
}

function scheduleRasterUpdate(): void {
  thresholdValue.value = thresholdSlider.value;
  if (!currentRaster) return;
  const currentRequest = ++requestId;
  pendingContext = { fileName: activeFileName, raster: currentRaster };
  statusLine.textContent = "Updating raster outline…";
  statusLine.classList.remove("is-error");
  window.clearTimeout(thresholdTimer);
  thresholdTimer = window.setTimeout(() => {
    if (currentRequest !== requestId || !currentRaster) return;
    sendRasterRequest(currentRequest, currentRaster, Number(thresholdSlider.value), invertToggle.checked);
  }, 70);
}

function sendRasterRequest(id: number, raster: RasterSource, threshold: number, invert: boolean): void {
  const pixels = new Uint8ClampedArray(raster.pixels);
  const request: ProcessorRequest = {
    requestId: id,
    kind: "raster",
    width: raster.width,
    height: raster.height,
    pixels,
    threshold,
    invert,
  };
  worker.postMessage(request, [pixels.buffer]);
}

function updateRasterControls(): void {
  const available = currentRaster !== null && !pendingContext;
  thresholdSlider.disabled = !available || currentRaster?.transparent === true;
  invertToggle.disabled = !available;
  const invertSubtitle = document.querySelector<HTMLSpanElement>(".toggle-subtitle");
  if (invertSubtitle) invertSubtitle.textContent = currentRaster?.transparent ? "Trace transparent regions" : "Trace lighter regions";
}

function updateStatusSummary(label: string, result: ProcessedDrawing): void {
  const count = result.contours.length;
  const summary = `${label} · ${count} ${count === 1 ? "contour" : "contours"}`;
  statusLine.textContent = summary;
  statusLine.classList.remove("is-error");
}

function updateContourCount(count: number): void {
  contourCount.textContent = `${count} ${count === 1 ? "contour" : "contours"}`;
}

function showDetails(skipped: number, omitted: number, transparent: boolean): void {
  const details: string[] = [];
  if (transparent) details.push("Transparency mask");
  if (skipped > 0) details.push(`${skipped} unsupported SVG ${skipped === 1 ? "element" : "elements"} skipped`);
  if (omitted > 0) details.push(`${omitted} shorter ${omitted === 1 ? "outline" : "outlines"} omitted`);
  importDetail.textContent = details.length > 0 ? details.join(" · ") : "All detected outlines are shown.";
}

function selectCustomImage(fileName: string): void {
  if (!customOption) {
    customOption = document.createElement("option");
    customOption.value = "custom";
    exampleSelect.append(customOption);
  }
  customOption.textContent = fileName;
  exampleSelect.value = "custom";
}

function setImportError(message: string): void {
  statusLine.textContent = message;
  statusLine.classList.add("is-error");
}
