# 0007: Open source license

Status: Decided, 2026-10-09
Needed before: First public commit

## Context

The repository is public on GitHub and had no license file, which by default reserves all rights. The design incorporates GrapesJS core under BSD 3-Clause and studies other open-source editors locally; a referenced product's license applies only if its code is incorporated.

## Options

1. MIT.
2. Apache 2.0, which adds an explicit patent grant.
3. BSD 3-Clause, matching GrapesJS.

## Decision

MIT, confirmed by the maintainer on 2026-10-09. Changing the license later would require consent from every contributor, so this is treated as settled.

## Consequences

The `LICENSE` file exists at the repository root. Third-party notices for GrapesJS must be preserved when its code ships in a package.
