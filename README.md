# Spinier

Spinier is a browser-based Fourier epicycle simulator. Open an SVG or raster image, inspect its outlines, and see every selected contour traced at the same phase by its own rotating vector chain.

Image decoding, thresholding, contour tracing, and Fourier analysis run in the browser. Image files are not uploaded to a server.

## Run locally

```sh
npm ci
npm run dev
```

## Image support

- SVG geometry includes `path`, `line`, `polyline`, `polygon`, `rect`, `circle`, and `ellipse` elements inside `svg` and `g` containers. Nested transforms and compound paths are sampled. Unsupported active elements are skipped and reported.
- Browser-decodable raster formats are reduced to a 512-pixel maximum side. Transparent images are traced using alpha. Opaque images use a luminance threshold that can be adjusted in the interface.
- Files are limited to 20 MB. Up to 24 of the longest detected contours are shown.
- The current version visualizes outlines and supports line art and silhouettes. It does not reproduce raster color fills.

## Project map

- `src/import/` validates SVG geometry, prepares contours, and traces raster masks.
- `src/math/` resamples contours and computes Fourier coefficients.
- `src/workers/` runs raster tracing and imported-image FFT work away from the interface thread.
- `src/render/` draws the source, epicycle chains, and fading trails on Canvas 2D.
- `src/main.ts` connects file selection, examples, controls, worker requests, and status feedback.
- `tests/` contains math and import unit tests plus browser interaction tests.

## Checks and deployment

Run `npm run typecheck`, `npm test`, `npm run test:e2e`, and `npm run build` before submitting a pull request. Pull requests target `main`. GitHub Actions deploys successful changes merged into `main` to GitHub Pages at [philipofmacedon.github.io/spinier](https://philipofmacedon.github.io/spinier/).

See [CONTRIBUTING.md](CONTRIBUTING.md) and [`agents/`](agents/README.md) for contributor and Git workflow guidance.
