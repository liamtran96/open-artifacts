# 0005: Host authorization deployment

Status: Decided (2026-10-09)
Needed before: Slice 2

## Context

The storage adapter interface runs wherever the host places it. In a browser-only integration the adapter calls the host's API and the API enforces authorization. In a server-side integration, tool handlers may call storage directly. The documented rule is that the backend is the boundary and the SDK authorizer is advisory. The examples and reference adapter must show a safe shape without pretending to be a backend.

Comparable tools place the boundary the same way. tldraw sync and Hocuspocus ship a reference server whose authentication point is a hook the host must implement; the client only carries an opaque token. Liveblocks points the client at a host-owned auth endpoint that mints a token. GrapesJS and Puck ship no persistence at all and hand the host a save callback. None of them treat a client-side check as the security boundary, and none ship only an interface without a server reference.

Authorization runs in core before the adapter executes, so this decision is independent of artifact kind. It applies equally to the HTML, document, layout, and app adapters. Preview network egress for the app adapter (self-hosted Sandpack bundler, package fetching) is a separate concern and gets its own record.

## Options

1. Examples use the in-memory adapter in the browser and document in bold that it has no security boundary. A separate example shows a minimal server with a real check.
2. Ship a reference HTTP storage adapter that calls a documented REST contract, and a reference server implementing it with a host-implemented authorization hook.
3. Only document the interface; ship no server-side reference.

## Decision

Option 2.

- The SDK ships a reference HTTP storage adapter for the browser and a reference server that implements the documented REST contract. The REST contract is part of v1 documentation.
- The reference server exposes an `authorize` hook with the same signature as the `ArtifactAuthorizer` in [host adapters](../contracts/host-adapters.md#authorization-adapter). The hook has no permissive default. The server refuses to start without one, and the shipped sample implementation verifies a signed token and maps `read` and `update` to distinct decisions so a later collaboration server can reuse it for read-only sessions.
- A denial from the hook returns `UNAUTHORIZED` through the REST contract, the embed API, and the tools. The end-to-end suite exercises this path against the reference server.
- The reference HTTP adapter accepts a host-supplied credential getter (header or token) and never interprets it. Credentials never reach the preview iframe.
- The in-memory adapter remains for tests and local demos only. Constructing it requires an explicit `unsafeInMemory: true` option, and its documentation states that it has no security boundary.

During the HTML milestone, before the storage interface stabilizes, examples may use the in-memory adapter under the option above. The `UNAUTHORIZED` end-to-end test is added in slice 2 against a minimal server so the denial path exists before the full reference server lands.

Option 1 was rejected as the final shape because examples become production code and a warning does not stop a host from wiring the in-memory adapter behind a login page. Option 3 was rejected because no comparable tool ships without a server reference, and every host would reinvent the boundary.

## Consequences

- Host examples demonstrate authorization through the reference server's hook, not through a browser callback.
- A REST contract for storage is documented and versioned with v1.
- End-to-end tests cover `UNAUTHORIZED` for `appendRevision` and, once the document adapter lands, for asset `resolve`.
- The reference server becomes a maintained package with its own release and security process.
- A future collaboration server reuses the `authorize` signature rather than defining a second permission model.
