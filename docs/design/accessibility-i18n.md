---
title: "Accessibility and localization"
---

# Accessibility and localization

Status: Requirements for the default editor shell; verified in slice 4 of the [implementation plan](../plans/2026-10-09-sdk-implementation-plan.md). Not yet implemented.

These rules apply to the default shell in packages/embed and to its React translation. Host-supplied slots are the host's responsibility, but the controller API must not make these rules impossible to meet.

## Accessibility

- Target WCAG 2.2 level AA for the default toolbar, inspector, version panel, status area, and conflict dialogs.
- Every control is reachable and operable by keyboard. Focus order follows visual order. Focus is visible in both themes.
- Shell controls use native elements or correct ARIA roles, names, and states. Icon-only buttons have accessible names.
- Status changes such as saving, saved, conflict, and preview error are announced through a live region, not only through color or icon.
- Text and interactive elements meet 4.5:1 contrast in light and dark themes. Theme tokens are documented so hosts can verify their overrides.
- The shell respects `prefers-reduced-motion`.
- Modal dialogs trap focus, restore it on close, and close on Escape.
- The preview iframe has a descriptive title. The shell exposes a keyboard path to move focus into and out of the preview.
- Editing canvas accessibility is bounded by the adapter library. Record known GrapesJS limitations in the HTML adapter's notes rather than claiming full canvas conformance.

Verification evidence for slice 4: an automated audit such as axe on both host examples with zero serious or critical issues, plus a manual keyboard pass through the acceptance journey.

## Localization

- The shell receives `locale` through session context from the host, as described in [architecture](architecture.md#editor-and-preview-isolation). It never reads browser locale on its own and never stores locale in a revision.
- All shell strings come from a message catalog keyed by stable IDs. English is the fallback. Hosts can supply a catalog for additional locales through a `messages` option on mount.
- Dates in the version panel are formatted with `Intl.DateTimeFormat` for the active locale. Relative times, if shown, are formatted with `Intl.RelativeTimeFormat`.
- Layout supports right-to-left locales through logical CSS properties. A manual RTL pass is part of slice 4 verification.
- Artifact content is user data and is not translated by the SDK.
- The same `locale` value reaches the preview through the runtime context so artifacts can localize themselves.
