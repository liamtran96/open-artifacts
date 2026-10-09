---
title: "Documentation index"
---

# Documentation index

These files are the single source of the documentation. The site under `apps/docs` renders this folder with [Fumadocs](https://www.fumadocs.dev/); run `pnpm --filter @open-artifacts/docs dev` to preview it. Each folder has a `meta.json` that fixes the sidebar order, and a `README.md` is its folder's index page. New users should start with [Getting started](getting-started.md).

| Folder | Contents | Lifecycle |
| --- | --- | --- |
| [guides/](guides/) | Worked examples and walkthroughs of implemented slices | Living; updated with the code |
| [design/](design/) | Architecture, glossary, and cross-cutting requirements | Living; updated as the design changes |
| [contracts/](contracts/) | Typed public surfaces: embed API, host adapters, agent tools, runtime protocol | Living; versioned with the code once it exists |
| [decisions/](decisions/) | One record per open or taken design decision | Append-only; supersede, never rewrite |
| [plans/](plans/) | Dated delivery plans | Dated records |
| [implementation-notes/](implementation-notes/) | Dated status and verification records | Dated records |
| references/ | Studies of other products that informed the design | Local-only, gitignored, never linked from committed docs |

## Guides

- [Runtime walkthrough](guides/runtime-walkthrough.md)

## Design

- [Architecture](design/architecture.md)
- [Glossary](design/glossary.md)
- [Accessibility and localization](design/accessibility-i18n.md)

## Contracts

- [Embed API](contracts/embed-api.md)
- [Host adapters](contracts/host-adapters.md)
- [Agent tools](contracts/agent-tools.md)
- [Runtime SDK](contracts/runtime-sdk.md)

## Decisions

- [Decision records](decisions/README.md)

## Plans and notes

- [2026-10-09 SDK implementation plan](plans/2026-10-09-sdk-implementation-plan.md)
- [2026-10-09 SDK foundation note](implementation-notes/2026-10-09-sdk-foundation.md)
