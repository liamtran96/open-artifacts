# 0002: Workspace tooling and package versions

Status: Decided (2026-10-09)
Needed before: Slice 1

## Context

The plan requires a TypeScript workspace with build, typecheck, lint, test, and dependency-rule checks across eight-plus packages, with ESM and IIFE outputs from one source.

Among comparable projects, pnpm plus Turbo is the common pattern (tldraw, Puck; Sandpack uses Turbo with Yarn). Vitest is used by tldraw and Excalidraw; Playwright by tldraw. Nx is used by none. tldraw additionally runs a circular-dependency check and API-extractor report, which map to this project's dependency-rule requirement.

## Options

1. pnpm workspaces, tsup or Vite library mode for builds, Vitest for unit tests, Playwright for browser lifecycle tests, ESLint with an import-boundary rule or dependency-cruiser for package rules, Changesets for versioning.
2. Same as option 1 with Turborepo for task caching.
3. Nx-managed monorepo.

## Decision

Option 2.

- pnpm workspaces with strict node linking. Phantom dependencies are disallowed so core cannot import an editor package by accident.
- Turborepo runs build, typecheck, lint, test, and e2e with caching from day one, so the full suite runs on every change.
- tsup builds each package to ESM, with an additional IIFE bundle for the runtime client. Vite serves the examples.
- Vitest for unit and integration tests. Playwright for browser lifecycle tests against the matrix in [decision 0001](0001-browser-and-runtime-support.md).
- dependency-cruiser enforces the package boundary rules from the architecture doc. The rule set is checked in CI; a violation fails the build.
- Changesets for versioning and changelogs. Packages are versioned independently.
- ESLint with typescript-eslint and Prettier for formatting.

Option 3 was rejected as heavier with no safety gain. Option 1 without Turbo was rejected because adding Turbo later would re-shape every script anyway.

## Consequences

- The implementation note records `pnpm turbo run build typecheck lint test` and `pnpm turbo run e2e` as the verification commands.
- Dependency rules live in one `.dependency-cruiser.cjs` at the root and are the enforcement mechanism from slice 1.
- Releases require a changeset file per user-visible change.
- Exact package versions are pinned in slice 1 and recorded in the implementation note, not in this record.
