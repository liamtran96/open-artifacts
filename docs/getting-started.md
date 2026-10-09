---
title: "Getting started"
description: "What Open Artifacts is, where it stands, and how to run the workspace."
---

# Getting started

Open Artifacts is an embeddable SDK for products that have an AI agent. The agent creates artifacts such as documents, dashboard layouts, HTML pages, and small apps. Users open the same artifact in an editor suited to its kind and change it directly. Both keep working from one saved artifact with a revision history.

## Status

The SDK is at the design stage. The documentation on this site describes the proposed design, and every design decision has been recorded. The workspace contains package skeletons that build and test, but no runtime behaviour is implemented yet. Nothing here should be read as a working release.

The first product milestone is editable HTML artifacts. See the [implementation plan](plans/2026-10-09-sdk-implementation-plan.md) for the delivery sequence and the [implementation note](implementation-notes/2026-10-09-sdk-foundation.md) for what has been verified so far.

## What a host product provides

The SDK does not bring its own backend, model, or login. A host product supplies:

- **Identity and authorization.** Every operation carries a caller context, and the host's backend is the security boundary. See [host adapters](contracts/host-adapters.md) and [decision 0005](decisions/0005-host-authorization-deployment.md).
- **Storage.** Revisions are appended through a storage adapter the host implements.
- **An agent.** The SDK exposes provider-independent tool definitions; the host wires them to its own model. See [agent tools](contracts/agent-tools.md).
- **Assets.** Images and fonts are uploaded and resolved through a host adapter, within the limits in [decision 0004](decisions/0004-asset-transport-and-export-policy.md).

## Artifact kinds

| Kind | Editor | Status |
| --- | --- | --- |
| `html` | GrapesJS | First milestone |
| `document` | ProseMirror | After the HTML milestone |
| `layout` | Puck | After the HTML milestone |
| `app` | CodeMirror and Sandpack | After the HTML milestone |

Hosts install only the adapters they need. The core package never imports an editor.

## Running the workspace

Node 22.12 or newer and pnpm 10 or newer are required.

```sh
pnpm install
pnpm build
pnpm check        # build, typecheck, lint, dependency rules, unit tests
pnpm --filter @open-artifacts/docs dev   # this documentation site
```

The full command list and contribution rules are in [CONTRIBUTING](https://github.com/liamtran96/open-artifacts/blob/main/CONTRIBUTING.md).

## Where to read next

1. [Architecture](design/architecture.md) for package boundaries, the saved artifact model, and preview isolation.
2. [Glossary](design/glossary.md) for the vocabulary used everywhere else.
3. [Embed API](contracts/embed-api.md), [host adapters](contracts/host-adapters.md), [agent tools](contracts/agent-tools.md), and the [runtime SDK](contracts/runtime-sdk.md) for the typed contracts.
4. [Decision records](decisions/README.md) for why the design is shaped the way it is.
