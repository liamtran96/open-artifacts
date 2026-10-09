# 0001: Browser and runtime support policy

Status: Decided (2026-10-09)
Needed before: Slice 1

## Context

The runtime client and host bridge rely on `postMessage`, sandboxed iframes without `allow-same-origin`, CSP, and ES modules. The editor shell and GrapesJS add further DOM requirements. A support policy decides the build target, the polyfill stance, and what the browser lifecycle tests run against.

None of the comparable projects (tldraw, Excalidraw, GrapesJS, Puck, Sandpack) publishes a `browserslist` field; they state support in prose and build for modern targets without a legacy bundle. The isolation features this SDK depends on have been stable in every evergreen engine since Safari 15.4.

## Options

1. Evergreen only: last two versions of Chrome, Edge, Firefox, and Safari, plus iOS Safari and Android Chrome of the same window. Build target ES2022.
2. Option 1 plus Safari 15 for one extra release cycle.
3. A `browserslist` query maintained in the workspace and consumed by the build.

## Decision

Option 1, expressed through option 3's mechanism.

- The workspace holds one `browserslist` query equivalent to "last 2 versions of Chrome, Edge, Firefox, Safari, iOS Safari, and Android Chrome, not dead". The build, lint, and Playwright matrix read it; no package restates the list.
- TypeScript and bundler target is ES2022. No legacy or transpiled-down build is shipped, and no polyfills for sandbox, CSP, or module features are added.
- Browser lifecycle tests run on Chromium, Firefox, and WebKit in Playwright. Mobile engines are covered by the same WebKit and Chromium runs with mobile viewports.

Option 2 was rejected because supporting an older Safari would require workaround code around the exact features that provide preview isolation, and that code is where isolation leaks. Older browsers are not blocked at runtime; they are simply unsupported.

## Consequences

- `tsconfig` `target` is ES2022 across packages.
- No legacy build, no polyfill dependency, no runtime feature detection beyond a single startup check that fails `mount` with `UNSUPPORTED_OPERATION` and a descriptive message when sandboxed iframes or ES modules are missing.
- The Playwright matrix is Chromium, Firefox, and WebKit, desktop and mobile viewports.
- Widening support later requires a new record.
