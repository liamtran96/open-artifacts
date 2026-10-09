---
title: "Artifact runtime SDK contract"
---

# Artifact runtime SDK contract

Status: v1 contract, implemented in `packages/runtime` (2026-10-09): client, host bridge, and React entry, with unit and in-process integration tests and a Chromium run of both examples. See the [implementation note](../implementation-notes/2026-10-09-sdk-foundation.md).

This is the first technical slice in the [SDK plan](../plans/2026-10-09-sdk-implementation-plan.md). It serves JavaScript/TypeScript running inside isolated HTML or React previews. The trusted editor embedding API is a separate concern; see [architecture](../design/architecture.md).

The editor-controller design in [architecture](../design/architecture.md) informs the trusted controller, structured snapshots, and extension boundaries. This iframe API remains limited to public context/theme access; the trusted controller, document store, and adapter registry are never exposed through it. Host-propagated theme updates are runtime/session events and do not modify the saved artifact document.

## Initial API

Package name: @open-artifacts/runtime (workspace name; npm availability must be checked before publication). The client exposes a read-only `status` ("idle", "connecting", "connected", "disconnected", "disposed") and `subscribeStatus(listener)` in addition to the members below, and `createArtifactClient` accepts `window`, `targetOrigin`, `timeoutMs`, `retryIntervalMs`, and `onListenerError` options.

```ts
type ArtifactKind = "html" | "document" | "layout" | "app";

type ArtifactContext = Readonly<{
  artifactId: string;
  viewedRevision: number;
  kind: ArtifactKind;
  theme: "light" | "dark";
  locale: string;
}>;

type Capability = "context.read" | "context.subscribe";

type Connection = Readonly<{
  protocolVersion: 1;
  capabilities: readonly Capability[];
  context: ArtifactContext;
}>;

interface ArtifactClient {
  connect(): Promise<Connection>;
  context: {
    get(): ArtifactContext | undefined;
    subscribe(listener: (context: ArtifactContext) => void): () => void;
  };
  dispose(): void;
}
```

The v1 capability vocabulary is context.read and context.subscribe. The host returns the subset its policy allows; the client must not assume any member is present. Future capabilities extend the Capability union and arrive through the same negotiated list.

createArtifactClient() creates one client. connect() resolves after host validation and protocol negotiation. Repeated calls share the same in-progress connection and return the active connection after success. A failed attempt releases its resources so a later explicit call can retry. No caller has to send raw bridge messages.

context.get() is undefined before initialization and after disposal. Snapshots are immutable copies. subscribe() may be called before connecting; it emits the initial snapshot and subsequent changed snapshots, returning an idempotent unsubscribe function. Registering after connection immediately emits the current snapshot. Listener failures must not prevent delivery to other subscribers.

dispose() is idempotent and terminal: remove listeners, clear timers and subscriptions, and reject pending connect() with DISPOSED. Later connect() rejects with DISPOSED. React cleanup disposes its own client; a new effect instance creates a fresh one, including development Strict Mode remounts.

## Host API

Expose a separate trusted entry point, @open-artifacts/runtime/host:

- createArtifactHostBridge({ iframe, context }) binds a bridge to one iframe and a host-supplied, validated context.
- setContext({ theme, locale }) publishes changed context. Artifact identity, kind, and viewed revision are immutable within the session.
- dispose() removes listeners and sends teardown when possible.
- getContext() returns the context currently published; sessionId exposes the current session identifier, which rotates on every frame load.
- Options: capabilities (default: all v1 capabilities), targetOrigin (default "*"), and window (default globalThis.window).

Bind the host listener before navigating/loading the artifact. The host remains authoritative for identity and revision; ignore any client-supplied replacements. Sessions are bound to the document in the frame: every client sends a per-document `documentId` in initialize, clients in the same document share one session, and the first initialize from a different document (a reload or navigation) starts a new session. The host does not use the iframe `load` event, because a document's scripts run before its own load event fires. Navigating to a different artifact or revision disposes and recreates the bridge with new host context.

Plain HTML and React examples use this same host API. Artifact React hooks consume the same core client through the optional @open-artifacts/runtime/react entry; React is an optional peer dependency and is never imported by the base runtime entry. The entry exports `useArtifactClient(options)`, which creates one client per mounted effect instance, connects it, and returns `{ client, status, context, connection, error }`; `ArtifactProvider`, which owns one such client for a subtree; and `useArtifact()` / `useArtifactContext()`, which read it. Effect cleanup disposes the client, so a Strict Mode remount creates a fresh one.

## Protocol and lifecycle

Use [JSON-RPC 2.0](https://www.jsonrpc.org/specification) over window.postMessage. Reserve oa/ method names; separate the protocol version from the npm package version.

| Method | Direction | Behavior |
| --- | --- | --- |
| oa/initialize | Client -> host request | Advertise supported protocol versions and the document ID; return selected version, public capabilities, host context, and the session ID for that document |
| oa/context-changed | Host -> client notification | Supply the session ID, a strictly increasing context sequence, and a full context snapshot |
| oa/teardown | Host -> client notification | End the matching connection and invalidate cached context |

```mermaid
sequenceDiagram
    participant H as Host bridge
    participant F as Artifact iframe client
    H->>H: bind listener to iframe.contentWindow
    H->>F: load artifact
    F->>F: listen for parent messages
    loop every 250 ms until 5 s deadline
        F->>H: oa/initialize { protocolVersions, documentId }
    end
    H-->>F: result { protocolVersion, capabilities, context, sessionId, sequence: 3 }
    Note over H,F: theme change while initialize is pending
    H->>F: oa/context-changed { sessionId, sequence: 4, context }
    F->>F: queue newest notification, apply if sequence > 3
    H->>F: oa/context-changed { sessionId, sequence: 5, context }
    F->>F: apply, emit snapshot to subscribers
    H->>F: oa/teardown { sessionId }
    F->>F: invalidate connection, reject pending with DISCONNECTED
```

The initialize result includes the current context sequence. Requests use unique IDs; responses must match the active request and sender. A valid repeat of the same initialization request from the same document returns the same session and the current sequence. The `documentId` is generated once per document and stored on the window object so an IIFE and an ESM client in the same document share it; it is not a secret. Once connected, a second SDK client may receive the same session context; it does not receive additional permissions.

The client listens before sending initialize. Retry the same initialization request on a bounded interval until a default 5-second deadline, covering host/frame startup ordering. Default retry interval: 250 ms. Allow test/configuration overrides, validate positive finite bounds, and stop retries on success, failure, or disposal. Queue only the newest matching-session context notification that arrives during initialization, then apply it if its sequence exceeds the initialization snapshot. Because the session ID is unknown until the result arrives, the client keeps the newest notification per observed session (bounded to eight sessions) and selects the matching one on success. This prevents theme changes during startup from being lost or applied out of order.

On teardown or navigation, invalidate subscriptions' connection state and reject pending operations with DISCONNECTED. A terminally disposed client cannot reconnect; a disconnected client can explicitly connect again. Late responses from old requests/sessions cannot restore a connection.

Reject incompatible initialization with PROTOCOL_MISMATCH; do not silently downgrade to unknown semantics. A JSON-RPC "Method not found" reply to initialize also maps to PROTOCOL_MISMATCH; any other host error without an SDK code maps to INVALID_MESSAGE. The host reports a mismatch with JSON-RPC code -32000 and `data.code = "PROTOCOL_MISMATCH"`, invalid params with -32602, and a malformed request that still carries an ID with -32600, both with `data.code = "INVALID_MESSAGE"`. Oversized traffic is dropped without a reply. Use stable SDK error codes TIMEOUT, PROTOCOL_MISMATCH, INVALID_MESSAGE, DISCONNECTED, DISPOSED, and HOST_UNAVAILABLE. Map these to JSON-RPC errors with the SDK code in error data. A top-level standalone preview without a parent rejects immediately with HOST_UNAVAILABLE; an unrelated parent eventually times out. Context/theme v1 exposes no write methods.

## Message boundary

Validate all JSON-RPC envelopes, request IDs, method names, session IDs, sequence numbers, context fields, and size limits at runtime. Set the initial control-message size limit to 16 KiB. Silently ignore unrelated/wrong-source traffic; reject a malformed matching initialization response with INVALID_MESSAGE so it cannot leave the client pending indefinitely. Reject unsupported valid requests with JSON-RPC Method not found.

The host accepts initialization only when event.source equals the configured iframe.contentWindow. The client accepts host messages only from its configured parent window. An opaque-origin artifact reports origin "null", which is not an identity. Sending to that iframe requires targetOrigin "*"; target the host's exact origin from the artifact when a trusted bootstrap supplies it. Recreate session bindings after navigation and never send secrets through the wildcard destination. See [MDN's sandbox messaging guidance](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/sandbox#best_practices).

Only public context crosses this bridge. Capability declarations do not grant permissions: host policy selects the allowed set, and the host must enforce it for every future operation even when the caller bypasses the SDK. Session IDs bind lifecycle traffic; they are not secret credentials.

## Distribution and examples

Build ESM JavaScript and declarations for authoring/bundling, and an IIFE exposing window.OpenArtifacts for plain HTML. Both builds come from the same source. Bundle React artifacts ahead of execution; do not rely on CDN imports, in-browser JSX transforms, eval, or new Function.

The preview host loads the chosen pinned runtime before authored code and records the runtime version/hash in build metadata. Use exactly one intentional loading path per artifact; bundling ESM must not also inject an unused global client. A mock host for local development implements the same initialization/context contract and never fabricates production authorization.

examples/plain-html-runtime and examples/react-runtime each run a host that switches theme, shows artifact identity/revision, and can destroy/recreate the preview, with the artifact in an iframe sandboxed to `allow-scripts` only (opaque origin). The plain example's artifact loads the IIFE through a classic script tag; the React example's artifact is bundled by Vite and uses the /react entry. Run `pnpm build` once, then `pnpm --filter example-plain-html-runtime dev` or `pnpm --filter example-react-runtime dev`. `pnpm e2e` starts both and drives them with Playwright.

## Acceptance behaviors

1. An opaque-origin HTML artifact and a React artifact connect to the same host contract and display the supplied identity/revision.
2. Theme changes update both artifacts, including a theme change while initialization is pending.
3. Repeated connect calls do not install duplicate listeners or duplicate notifications.
4. Wrong-window, malformed, oversized, stale-session, and out-of-order traffic cannot change context.
5. Timeout, mismatch, unmount during initialization, iframe reload, and repeated disposal leave no hanging promises or active retries.
6. The base package works without React/editor dependencies; the IIFE and ESM builds expose equivalent behavior.

Data access, session/persistent state, downloads, external links, comments, canvas controls, and model/tool execution are future capability contracts. Add each with its own authorization and lifecycle tests. MCP Apps remains an optional interoperability path; this v1 protocol does not claim compatibility with it.
