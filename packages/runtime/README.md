# @open-artifacts/runtime

Artifact-side context/theme client and trusted host bridge. ESM for bundlers and IIFE for plain HTML artifacts.

Status: the v1 context/theme client, host bridge, and React hooks are implemented, unit-tested in process, and exercised in Chromium through the two examples under `examples/`; see the [implementation note](../../docs/implementation-notes/2026-10-09-sdk-foundation.md).

Entries:

- `@open-artifacts/runtime` (ESM, and IIFE as `window.OpenArtifacts`): `createArtifactClient`, loaded inside the artifact iframe.
- `@open-artifacts/runtime/host` (ESM): `createArtifactHostBridge`, loaded by the trusted embedding page. Never load it in the iframe.
- `@open-artifacts/runtime/react` (ESM, React optional peer): `useArtifactClient`, `ArtifactProvider`, `useArtifact`, `useArtifactContext` for React artifacts.

```ts
// Inside the artifact
import { createArtifactClient } from "@open-artifacts/runtime";
const client = createArtifactClient();
const { context } = await client.connect();
client.context.subscribe((next) => document.documentElement.dataset.theme = next.theme);

// In the host page
import { createArtifactHostBridge } from "@open-artifacts/runtime/host";
const bridge = createArtifactHostBridge({ iframe, context: { artifactId, viewedRevision, kind: "html", theme: "light", locale: "en" } });
bridge.setContext({ theme: "dark" });
bridge.dispose();
```

Walkthrough with diagrams: [docs/guides/runtime-walkthrough.md](../../docs/guides/runtime-walkthrough.md). Contract: [docs/contracts/runtime-sdk.md](../../docs/contracts/runtime-sdk.md). Package boundaries are listed in [docs/design/architecture.md](../../docs/design/architecture.md) and enforced by `.dependency-cruiser.cjs`.
