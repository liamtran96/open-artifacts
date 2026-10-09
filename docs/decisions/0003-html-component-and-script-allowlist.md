# 0003: HTML component and script allowlist

Status: Decided (2026-10-09)
Needed before: Slice 3

## Context

Generated scripts are untrusted and are disabled in the editing canvas. The first milestone's calculator still needs interactivity. The adapter must define which components may carry behavior, how that behavior is expressed, and what the sanitizer strips from agent-supplied HTML before it becomes project JSON.

GrapesJS's own parser strips scripts and inline `on*` attributes by default, and re-enables them only through explicit `allowScripts` and `allowUnsafeAttr` options. Even when allowed, scripts do not execute in its canvas under CSP. GrapesJS has shipped XSS fixes in the past (for example CVE-2022-21802 in the selector manager), so its parser is a second line of defence, not the boundary. Puck represents the declarative alternative: no scripts, behaviour only through registered typed components.

## Options

1. A fixed set of trusted components such as button, input, select, and a `script` component whose content runs only in the isolated preview, never in the canvas. Sanitizer removes inline event attributes, `javascript:` URLs, and unknown script fields.
2. Option 1 plus a declarative interaction model, such as data attributes mapping events to allowed actions, that renders the same in canvas and preview.
3. No scripts in HTML artifacts; all interactivity deferred to the `app` kind.

## Decision

Option 1 for the calculator milestone, with option 2 layered on afterwards through a new record.

- The initial trusted component set is: container, text, heading, image, link, button, input, select, textarea, and `script`. Only `script` carries behaviour. The set is a registry in the HTML adapter and is extended by a new record or a documented host registration, never by agent output.
- The `script` component's content is stored as data in project JSON. It is never inserted into the editing canvas DOM. It executes only in the isolated preview iframe, delivered under a nonce- or hash-based CSP as defined in the runtime contract.
- The SDK's own sanitizer runs on agent-supplied HTML before GrapesJS parses it. It removes inline event attributes; `javascript:` URLs; `data:` URLs in `href` and `src` other than image data URLs permitted by [decision 0004](0004-asset-transport-and-export-policy.md); `<script>` tags outside the `script` component; `<iframe>`, `<object>`, `<embed>`, `<base>`, `<meta>`, and `<link>`; and any attribute or field the component registry does not declare. GrapesJS parser options stay at their safe defaults as a second line.
- The `insert_component` tool operation accepts only registry component IDs and their declared fields; unknown fields are rejected with `VALIDATION_FAILED`.
- Sanitizer test cases are part of the HTML adapter's acceptance suite and include each stripped construct above.

Option 3 was rejected because the first milestone's calculator needs behaviour. Option 2 alone was rejected for the first milestone because it costs more design work than the calculator justifies; it remains the intended follow-up for canvas-visible interactivity.

## Consequences

- The `insert_component` schema in the agent tools enumerates the registry.
- The HTML adapter ships sanitizer tests for every stripped construct.
- The preview uses nonce- or hash-authorized scripts; no `unsafe-inline` for scripts.
- Adding option 2's declarative model, or widening the registry, is a new record.
