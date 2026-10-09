---
title: "0006: Document adapter library"
---

# 0006: Document adapter library

Status: Decided, 2026-10-09
Needed before: Document adapter work starts, after the HTML milestone

## Context

The `document` kind needs a rich-text editing library with a schema-defined document model, custom interactive blocks such as charts and forms, stable block IDs for agent targeting, and a framework-free editor view so packages/embed stays independent of React. Two candidates were considered: ProseMirror directly, or Tiptap, which wraps ProseMirror with an extension and command layer.

In both cases the canonical payload is ProseMirror document JSON, so the `document` contract, migrations, and agent operation vocabulary do not depend on the choice. The choice affects the adapter view code and the amount of editor plumbing the project owns.

## Options

1. Tiptap core with a fixed extension set and vanilla DOM node views. Faster start, large ecosystem, MIT core. Adds a second abstraction layer, carries version churn across major releases, and has a paid tier for comments, version history, managed collaboration, and AI that the project must avoid.
2. ProseMirror directly with a hand-written schema. Smallest dependency surface, MIT throughout with no paid tier, very stable API, full control over schema, plugins, and node views. The project writes its own keymaps, input rules, paste handling, lists, tables, and history wiring, and contributors need to learn ProseMirror positions and transactions.

## Decision

Option 2: ProseMirror directly. The maintainer chose control, a single abstraction layer, and a dependency set with no commercial tier over the faster start Tiptap would give.

Constraints that follow:

- Dependencies are limited to the official `prosemirror-*` packages plus small MIT utilities. No editor framework layer is added on top later without superseding this record.
- The adapter view is written in plain DOM. Custom blocks are ProseMirror node views supplied by the trusted component registry; no React inside packages/adapter-document.
- Every block node carries a stable `id` attribute assigned by an adapter plugin on insertion and preserved through copy, paste, and undo. Agent operations target these IDs.
- Agent operations are expressed as validated ProseMirror transforms applied to a copy of the document, matching the draft-transaction model in the embed API.
- Markdown and HTML exports use `prosemirror-markdown` and the schema's DOM serializer.

## Consequences

- Slower first document milestone than Tiptap would allow; the plan must budget for schema, keymap, input-rule, list, and table work.
- Lowest long-term upgrade cost and no licence review for editor features.
- Collaboration, if added later, will need its own integration, for example through `y-prosemirror`, and is a separate decision.
- The README, architecture package table, and roadmap name ProseMirror only.
