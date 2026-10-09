# Contributing

Open Artifacts is at the design stage. Contributions right now are documentation, design review, and the first implementation slices in the [implementation plan](docs/plans/2026-10-09-sdk-implementation-plan.md).

## Before you start

- Read the [README](README.md), [architecture](docs/design/architecture.md), and [glossary](docs/design/glossary.md). Use the glossary's terms in docs, code, and commit messages.
- Check the [decision records](docs/decisions/README.md). If your change depends on an open decision, propose the decision first in its record.
- Open an issue for anything larger than a typo so the scope is agreed before work begins.

## Documentation changes

- Every design document carries a status line. Keep it accurate; do not describe unimplemented behavior as working.
- Public API changes update the matching contract document in the same change: [embed API](docs/contracts/embed-api.md), [host adapters](docs/contracts/host-adapters.md), [agent tools](docs/contracts/agent-tools.md), or [runtime contract](docs/contracts/runtime-sdk.md).
- Relative links must resolve. Dated files under `docs/plans` and `docs/implementation-notes` are records; add a new dated file rather than rewriting history.
- Put each document in its category folder; see [docs/README.md](docs/README.md).
- `docs/references/` holds studies of other products and is gitignored. Never link to it from committed docs and never commit it.

## Code changes

Tooling follows [decision 0002](docs/decisions/0002-workspace-tooling.md): pnpm workspaces, Turborepo, tsup, Vitest, Playwright, dependency-cruiser, Changesets, ESLint, and Prettier. Node 22.12 or newer and pnpm 10 or newer are required.

```sh
pnpm install
pnpm build          # tsup, ESM for every package plus IIFE for runtime
pnpm typecheck      # tsc --noEmit per package
pnpm lint           # eslint with type-aware rules
pnpm depcruise      # package boundary rules in .dependency-cruiser.cjs
pnpm test           # vitest per package
pnpm e2e            # playwright against the matrix in playwright.config.ts
pnpm format:check   # prettier
pnpm check          # build, typecheck, lint, depcruise, test
```

Run `pnpm exec playwright install` once before `pnpm e2e` to download the browsers.

- Core and the base runtime entry must not import React, DOM types, editor libraries, or model providers. `pnpm depcruise` fails the build on a violation; `lib` in each package's `tsconfig.json` omits `DOM` for core and tools.
- Every user-visible change to a published package needs a changeset: `pnpm changeset`.
- Each slice ships with the tests named in the plan's verification table. Tests exercise public APIs, not internal structure.
- Record commands actually run and their results in the current implementation note.

## Commits and pull requests

- One logical change per commit, written in the imperative mood.
- Describe what changed and why; link the issue or decision record.
- Do not add generated-by or co-author trailers for AI tools.
- Pull requests that touch a contract document must call out any breaking change to a schema, protocol, or error code.

## License

By contributing you agree that your contributions are licensed under the repository's [MIT license](LICENSE). Preserve third-party notices for any bundled dependency.
