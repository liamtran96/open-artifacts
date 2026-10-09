---
"@open-artifacts/runtime": minor
---

Add the v1 context/theme runtime: `createArtifactClient` for artifacts (ESM and `window.OpenArtifacts` IIFE) and `createArtifactHostBridge` under the new `@open-artifacts/runtime/host` entry, speaking JSON-RPC 2.0 over `postMessage` with bounded retry, session binding, ordered context updates, and teardown.
