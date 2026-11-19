# Git workflow

## Branching

- `main` is the reviewed, deployable branch.
- Use short-lived `codex/<slug>` branches for focused changes. Keep a separate branch for unrelated work.
- Do not commit feature work directly to `main`.

## Commits and pull requests

- Keep each commit focused and reversible. Use imperative subjects such as `feat: add raster contour import`, `fix: preserve open stroke endpoints`, or `docs: describe local image handling`.
- Push a feature branch and open a pull request to `main` with a summary, verification results, and screenshots for interface changes.
- Review the diff and resolve all failed checks before merging. Merge through the pull request, then remove the short-lived branch.
- Do not commit generated bundles, local image files, credentials, or machine-specific settings.

## Deployment

- GitHub Actions validates pull requests and deploys only successful pushes to `main`.
- GitHub Pages serves the Vite production build at `/spinier/`. Verify the deployed URL after a release.
- Revert a faulty deployment through a reviewed pull request so the deployment history stays understandable.
