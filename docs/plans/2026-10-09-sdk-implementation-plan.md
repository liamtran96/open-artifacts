---
title: "SDK implementation plan"
---

# SDK implementation plan

Date: 2026-10-09
Status: Proposed; documentation checkpoint. No SDK code exists yet.
Source: [Open Artifacts repository](https://github.com/liamtran96/open-artifacts) and the request to research and build the SDK, with a plan and documentation first.

## Goal and scope

Build the embeddable artifact SDK described in [README](../../README.md). Products supply their own agent, authentication, authorization, and storage. Users and agents edit the same saved artifact through a shared validation and revision path.

The first product milestone remains editable HTML/CSS with GrapesJS. The context/theme runtime SDK discussed in this session is the first technical slice within that milestone, not a replacement for the editor and persistence work.

At the time of this plan the repository contained only README.md and Git metadata; it now also holds the documentation set indexed in the README, and still no package code. The previously researched coda0HQ/open-artifacts project is a different project; its Worker, Recipe builder, and viewer bridge are not available here. Start from this repository's design rather than assuming those components exist.

Read [architecture](../design/architecture.md) and the [runtime SDK contract](../contracts/runtime-sdk.md) before implementation. All package names and API signatures are proposals until implemented and verified.

Follow the editor-SDK architecture pattern: a typed editor controller over schema/store modules, registered adapters, separated document/session state, and replaceable editor UI. Retain Open Artifacts' plain JavaScript integration and isolated preview requirements. Product reference studies behind this pattern are kept locally in docs/references and are not committed; none of them is selected as a dependency.

## Delivery sequence

Implement and verify one working slice at a time. Record completed behavior and commands actually run in the [implementation note](../implementation-notes/2026-10-09-sdk-foundation.md).

### 0. Documentation baseline

- [x] Inspect the actual repository and preserve its product direction.
- [x] Document package boundaries, source ownership, and revision semantics.
- [x] Specify the initial context/theme bridge and acceptance behaviors.
- [x] Add implementation and verification notes with an explicit planned status.
- [x] Map the editor-SDK architecture reference to controller, state, adapter, and UI boundaries.

### 1. Runtime context/theme foundation

- [x] Establish a TypeScript workspace with build, typecheck, lint, and test scripts.
- [x] Enforce package dependency rules: core/base runtime have no React or editor-library imports; optional adapters load independently.
- [x] Build a framework-independent runtime client and a trusted host bridge.
- [x] Implement protocol negotiation, context snapshots, theme updates, and deterministic teardown according to runtime-sdk.md.
- [x] Provide an ESM build with declarations and an IIFE build for plain HTML.
- [ ] Add a small React integration using the same client; keep React optional.
- [ ] Demonstrate an HTML artifact and a React artifact receiving the same context and live theme updates from a host.
- [ ] Verify iframe isolation and connection lifecycle in a real browser.

Exit condition: both examples connect, display the host's artifact ID and viewed revision, react to light/dark changes, and clean up without stale messages or unresolved connection promises. This slice does not claim that editing or persistence works.

### 2. Saved HTML artifacts

- [ ] Define core revision, adapter, authorization, storage, and event contracts as specified in the [embed API](../contracts/embed-api.md) and [host adapter contracts](../contracts/host-adapters.md).
- [ ] Implement the typed ArtifactEditorController over internal model/schema/store modules, usable without mounting the UI.
- [ ] Separate saved snapshots, editable drafts/draftGeneration, and per-editor session state; expose typed subscriptions.
- [ ] Add explicit adapter registration with duplicate-ID, kind, and schema compatibility checks.
- [ ] Implement create, read, save, list revisions, and restore through those contracts.
- [ ] Supply an in-memory reference storage adapter with atomic revision checks for tests and examples; clearly document its lack of durable storage.
- [ ] Add GrapesJS project validation, loading, serialization, and derived HTML/CSS export.
- [ ] Mount and dispose the HTML editor through a plain JavaScript embedding API.
- [ ] Translate native HTML editor changes/history into one controller event and undo path; programmatic loading must not count as user edits.
- [ ] Connect user saves to core operations rather than independent editor autosave.

Exit condition: text and style edits survive save and reopen; two updates from the same base revision cannot both succeed; restoring an old revision creates a new head revision.

### 3. Shared agent and user changes

- [ ] Expose provider-independent tool definitions and handlers for artifact operations in packages/tools, following the [agent tools contract](../contracts/agent-tools.md).
- [ ] Implement a bounded set of adapter operations using stable component identifiers, such as setting text, changing a style property, and inserting a supported component.
- [ ] Route tool calls through the same authorization, validation, and atomic save path as user edits.
- [ ] Apply each validated operation batch as one draft transaction and undo group; reject stale draftGeneration before mutating local work.
- [ ] Preserve unsaved editor changes when an external revision arrives; require reconciliation rather than replacing the draft.
- [ ] Keep unsupported generated scripts outside the editing canvas; allow only a documented interactive component set for the initial calculator example.

Exit condition: an agent creates a supported calculator, a user changes its title and colors, and an agent change based on the latest revision preserves those edits. A change based on an older revision returns a conflict and leaves the latest artifact intact.

### 4. Complete the HTML product milestone

- [ ] Build the isolated interactive preview using the runtime bridge from slice 1.
- [ ] Add version browsing, restoration, export, and actionable error/conflict handling to the embedded shell.
- [ ] Supply default toolbar, inspector, version panel, and status slots; prove a host can replace controls using the same controller API.
- [ ] Add the optional React host wrapper with mount/unmount parity.
- [ ] Expose the same controller through a React mount callback and context/hooks without making core React-dependent.
- [ ] Ship plain JavaScript and React host examples covering the full acceptance journey.
- [ ] Verify asset handling, export behavior, [accessibility and localization](../design/accessibility-i18n.md), and isolation across supported browsers.
- [ ] Validate package tarballs and public imports before declaring a release ready.

Exit condition: the complete README calculator journey works in both host examples, including reopen, stale-update rejection, preview, export, and restore.

## Verification strategy

Test externally observable behavior through public APIs. Add each regression or integration test alongside the slice it verifies; avoid tests tied to private implementation structure.

| Area | Required evidence |
| --- | --- |
| Runtime client | Connection before/after host readiness, repeat connect, timeout, protocol mismatch, update subscription, disposal during connection |
| Host bridge | Reject wrong sender, malformed payloads, obsolete sessions, and unsupported methods; bind context to the host's configured artifact |
| Browser lifecycle | HTML and React preview, opaque-origin iframe, theme updates, frame reload, unmount/remount, no listener/timer leaks |
| Core/storage | Save/reopen, authorization failure, atomic conflict under concurrent writes, immutable history, append-only restore |
| Controller/state | Failed batches leave drafts unchanged; draftGeneration rejects stale local work; one undo group per batch; session changes create no revision |
| HTML adapter | Round-trip project JSON, stable component identity, targeted changes preserve unrelated fields, invalid input rejected before editing |
| Adapter/UI lifecycle | Duplicate registration fails; optional editor loading; custom slots issue the same commands; native history and load events do not double-apply changes |
| End-to-end | Agent create -> user edit/save -> agent update -> reopen -> export -> restore |
| Distribution | ESM and IIFE consumption, declaration checks, optional React, core independent of editor dependencies |

The workspace scaffold runs build, typecheck, lint, dependency rules, unit tests, and an empty Playwright suite; the commands are listed in [CONTRIBUTING](../../CONTRIBUTING.md) and the results in the [implementation note](../implementation-notes/2026-10-09-sdk-foundation.md). Package tests only assert the scaffold exports; no runtime behavior is verified yet.

## Later work and decisions

Document, layout, and app adapters follow the HTML milestone. Collaboration, generic AI/tool execution inside artifacts, durable runtime state, and MCP integrations are later work. Supporting arbitrary generated React applications visually is not part of the HTML milestone.

All deferred design questions are now decided and recorded in [docs/decisions](../decisions/README.md): browser support is evergreen ES2022 via a `browserslist` query ([0001](../decisions/0001-browser-and-runtime-support.md)); tooling is pnpm, Turborepo, tsup, Vitest, Playwright, dependency-cruiser, and Changesets ([0002](../decisions/0002-workspace-tooling.md)); the HTML adapter ships a fixed component registry with a preview-only `script` component and an SDK sanitizer that runs before GrapesJS ([0003](../decisions/0003-html-component-and-script-allowlist.md)); assets are bounded inline data URLs through slice 3 and a single host-resolved origin from slice 4 ([0004](../decisions/0004-asset-transport-and-export-policy.md)); authorization is a reference HTTP adapter and server with a host-implemented hook ([0005](../decisions/0005-host-authorization-deployment.md)); the document adapter uses ProseMirror directly ([0006](../decisions/0006-document-adapter-library.md)). A change to any of these is a new superseding record, not an edit.
