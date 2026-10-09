# Changelog

All notable changes to this repository are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). No package has been published; entries describe documentation until slice 1 ships code.

## [Unreleased]

### Added

- Design documentation set: README, architecture, runtime SDK contract, implementation plan, and implementation note.
- Typed contract documents for the trusted embed API, host storage/authorization/asset adapters, and agent tools, including a revision envelope example and the conflict response shape.
- Glossary, accessibility and localization requirements, and decision records for the open design questions.
- Proposed `packages/tools` as the home for agent tool definitions.
- Decision 0006: the document adapter uses ProseMirror directly.
- Planned export formats per artifact kind.
- Bridge handshake sequence diagram in the runtime contract.
- Repository files: MIT license (decision 0007), `.gitignore`, contributing guide, and this changelog.

### Changed

- Docs are grouped by category: `design/`, `contracts/`, `decisions/`, `plans/`, `implementation-notes/`. Product reference studies under `docs/references/` are local-only and gitignored.

- Runtime `Connection.capabilities` is now a host-selected list rather than a fixed tuple, matching the stated policy model.
- Locale is documented as host-supplied session context across README and architecture, not only in the runtime contract.
