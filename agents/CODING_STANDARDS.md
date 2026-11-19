# Coding standards

## Code quality and architecture

- Use descriptive TypeScript names and keep strict type checking enabled.
- Keep focused modules for import parsing, contour processing, Fourier math, canvas rendering, and interface state.
- Prefer small functions with explicit inputs and outputs. Add an abstraction only when it clarifies a repeated responsibility.
- Keep geometry units and contour open/closed state explicit in shared types.
- Comment non-obvious math or security decisions. Document meaningful changes to shared interfaces.

## Input handling and privacy

- Treat SVG files and raster pixels as untrusted. Parse SVG as data, use the element and attribute allowlists, and never insert imported markup into the live document.
- Validate file size, dimensions, point values, and processing results before using them.
- Keep file decoding, contour tracing, and Fourier analysis in the browser. Do not upload selected image data or add an image service.
- Keep image imports free of network requests. Bundle runtime dependencies with the application.
- Give clear errors for malformed, unsupported, empty, and oversized files while preserving the current drawing.

## Tests and maintenance

- Add focused unit tests for new contour and Fourier behavior, including edge cases.
- Add or update browser tests for user-visible interactions, import flows, responsive behavior, and network boundaries.
- Run `npm run typecheck`, `npm test`, `npm run test:e2e`, and `npm run build` before opening or updating a pull request.
- Keep generated builds, uploaded images, and browser reports out of Git.
