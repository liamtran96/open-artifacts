# SDK foundation: planning checkpoint

Date: 2026-10-09
Status: Documentation added; runtime implementation and execution tests pending.
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
- No package, build, runtime, or application tests exist yet. No runtime behavior is claimed as verified.

## Remaining work and maintenance

Implement the plan's unchecked slices and append actual test commands/results here. Public package names, toolchain/browser support, safe HTML input policy, and asset behavior remain implementation decisions identified in the plan. Do not claim a completed HTML editing SDK when only the context/theme slice is implemented.

Update the runtime contract alongside changes to messages or exported APIs. Version protocol and persisted adapter schemas explicitly, preserve historical revisions, and keep preview/session state distinct from saved source. Add future adapter notes when those features land.
