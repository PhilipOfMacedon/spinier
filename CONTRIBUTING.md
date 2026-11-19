# Contributing to Spinier

Start with [AGENTS.md](AGENTS.md), then read the linked contributor guidance under [`agents/`](agents/README.md).

## Local development

```sh
npm ci
npm run dev
```

## Before a pull request

```sh
npm run typecheck
npm test
npm run test:e2e
npm run build
```

Open a focused `codex/<slug>` branch and submit a pull request to `main`. Include the relevant checks and a screenshot for interface changes. GitHub Actions runs the same checks and publishes successful changes merged into `main`.
