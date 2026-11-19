/// <reference lib="webworker" />

import { processContours } from "../import/process";
import { traceRaster } from "../import/raster";
import type { ProcessorRequest, ProcessorResponse } from "./protocol";

const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.addEventListener("message", (event: MessageEvent<ProcessorRequest>) => {
  const message = event.data;
  try {
    const response: ProcessorResponse = message.kind === "raster"
      ? rasterResponse(message)
      : {
        requestId: message.requestId,
        ok: true,
        drawing: processContours(message.contours, message.skipped, message.omitted),
      };
    workerScope.postMessage(response);
  } catch (error) {
    const response: ProcessorResponse = {
      requestId: message.requestId,
      ok: false,
      error: error instanceof Error ? error.message : "The image could not be processed.",
    };
    workerScope.postMessage(response);
  }
});

function rasterResponse(message: Extract<ProcessorRequest, { kind: "raster" }>): ProcessorResponse {
  const traced = traceRaster(
    { width: message.width, height: message.height, data: message.pixels },
    message.threshold,
    message.invert,
  );
  return {
    requestId: message.requestId,
    ok: true,
    drawing: processContours(traced.contours, 0, traced.omitted),
    transparent: traced.transparent,
  };
}
