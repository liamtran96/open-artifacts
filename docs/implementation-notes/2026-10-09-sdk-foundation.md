---
title: "SDK foundation: planning checkpoint"
---

# SDK foundation: planning checkpoint

Date: 2026-10-09
Status: Documentation, workspace scaffold, and documentation site added; runtime implementation and behavior tests pending.
Source: [liamtran96/open-artifacts](https://github.com/liamtran96/open-artifacts) and the request to build a standard SDK, adding a plan and documentation first. No issue/ticket link was supplied.

Additional source request: study an existing open-source editor SDK as an architectural reference. The study notes are kept locally in docs/references and are not committed.

## Goal

Turn the existing product README into an implementable SDK plan. Define the shared context/theme runtime slice while preserving the first product milestone: editable HTML artifacts with shared user/agent persistence.

## Affected files

- README.md: links to the plan and technical documentation.
- docs/plans/2026-10-09-sdk-implementation-plan.md: slices, completion criteria, and verification matrix.
- docs/design/architecture.md: host/runtime boundaries, packages, canonical source, revisions, and editor isolation.
- docs/contracts/runtime-sdk.md: proposed public APIs, wire protocol, lifecycle, distribution, and acceptance behaviors.
- docs/references/ (local only, not committed): product reference studies mapped to this SDK's boundaries.
- docs/contracts/embed-api.md, docs/contracts/host-adapters.md, docs/contracts/agent-tools.md: typed contracts for the trusted host API, host-provided adapters, and agent tools.
- docs/design/glossary.md, docs/design/accessibility-i18n.md, docs/decisions/: shared vocabulary, shell requirements, and decision records (all seven decided on 2026-10-09).
- LICENSE, .gitignore, CONTRIBUTING.md, CHANGELOG.md: repository hygiene files.
- This note: planning status and subsequent verification record.

## Decisions and flow

The actual repository contains README.md and Git metadata, with no packages or existing viewer. The earlier coda0HQ/open-artifacts research refers to a different project and is not a codebase dependency.

Implementation starts with a typed artifact client and trusted host bridge, demonstrated with HTML and React. Core revision/storage operations and the GrapesJS adapter follow. User and agent updates ultimately share one authorized validation/save flow. Generated interactive content runs separately from the editing canvas.

The editor-SDK reference study adds a central trusted ArtifactEditorController, internal model/schema/store boundaries, typed snapshot subscriptions, explicit adapter registration, replaceable default UI slots, and a separate asset contract. Draft transactions/undo groups are distinct from persisted revision commits. The HTML adapter translates native history instead of creating competing undo stacks. Core remains independent of React; the artifact iframe receives only the narrow runtime API. No reference-product code or dependency was added.

## Verification

- Read the complete local README and repository remote to establish product identity.
- Checked the working tree before changes; README.md was already untracked and its existing content was preserved.
- Checked the added documentation for local link resolution, status labels, scope consistency, and whitespace errors.
- Reviewed a pinned source snapshot of the reference editor SDK: package manifests, snapshot loading, store schema/migrations, custom UI and store-event examples, and agent update handlers; cross-checked its official editor, persistence, shapes, UI, and asset docs. Commit hash and details are in the local reference note.
- No runtime behavior is claimed as verified. The scaffold below only proves the toolchain runs.

## Documentation site (2026-10-09)

`apps/docs` is a Next.js 16 app using Fumadocs 16 (fumadocs-core 16.16.2, fumadocs-mdx 15.4.6, Next 16.3.8). It renders the repository `docs/` folder directly through `defineDocs({ dir: "../../docs" })`; there is no second copy of any page. Each markdown file gained a frontmatter `title` (the H1 text, which stays in the file for GitHub and is stripped at render time). `meta.json` files fix the sidebar order, and `README.md` maps to its folder index via a custom `slugs` function. A remark plugin normalises GitHub-style relative links (bare paths, folder links, links that leave `docs/`) because Fumadocs resolves only `./` and `../` links; mermaid fences render through `remarkMdxMermaid` and a client component. The app shares the workspace ESLint and Prettier config; `eslint-config-next` was dropped because it cannot resolve its parser under pnpm isolated linking.

Commands run and results:

- `pnpm --filter @open-artifacts/docs build`: compiled, 63 static routes generated (19 doc pages plus markdown, llms, and OG image routes).
- `pnpm --filter @open-artifacts/docs typecheck` and `lint`: clean.
- Served the build on port 3123 and checked in Chromium: sidebar order, titles, the architecture page, the decisions index table links, and the mermaid diagram. A scan of six representative pages found no unresolved relative `href`; folder links resolve to each folder index and the CONTRIBUTING link points at GitHub.

## Workspace scaffold (2026-10-09)

Slice 1's first two items. Six package skeletons exist under `packages/`: core, runtime, embed, react, tools, adapter-html. Each exports only a `packageName` constant; the future adapters (document, layout, app) are not scaffolded.

Pinned versions: TypeScript 5.9.3 (typescript-eslint caps TypeScript below 6.1), tsup 8.5.1, Turborepo 2.11.7, Vitest 5.0.3, Playwright 1.64.0, dependency-cruiser 18.5.0, Changesets 3.0.3, ESLint 10.12.0 with typescript-eslint 8.71.1, Prettier 3.9.9, pnpm 10.29.3, Node 26.1.0 locally.

Commands run and results:

- `pnpm install`: 294 packages, strict isolated linking, exact versions saved.
- `pnpm build`: 6 of 6 tasks succeeded; ESM plus declarations for every package, IIFE bundle `dist/index.global.js` for runtime.
- `pnpm typecheck`: 6 of 6 succeeded after removing `rootDir` from package tsconfigs so config files typecheck.
- `pnpm lint`: 6 of 6 succeeded with `strictTypeChecked` and `stylisticTypeChecked`.
- `pnpm depcruise`: no violations across the packages. A deliberate probe with four violations (React in core, an undeclared workspace package in core, GrapesJS in tools, and a relative import from embed into core's `src`) was reported as four errors, then removed. Core and tools additionally omit `DOM` from their TypeScript `lib`.
- `pnpm test`: 6 package suites, 6 tests passed, each asserting the scaffold export.
- `pnpm e2e`: passes with no tests via `--pass-with-no-tests`; browsers are not yet installed on this machine.
- `pnpm format:check`: clean. Markdown is excluded from Prettier to avoid reflowing the design documents.

## Remaining work and maintenance

Implement the plan's unchecked slices and append actual test commands/results here. Public package names, toolchain/browser support, safe HTML input policy, and asset behavior remain implementation decisions identified in the plan. Do not claim a completed HTML editing SDK when only the context/theme slice is implemented.

Update the runtime contract alongside changes to messages or exported APIs. Version protocol and persisted adapter schemas explicitly, preserve historical revisions, and keep preview/session state distinct from saved source. Add future adapter notes when those features land.
