# Host adapter contracts

Status: Proposed v1 interfaces; nothing is implemented. Names are provisional until slice 2 of the [implementation plan](../plans/2026-10-09-sdk-implementation-plan.md) lands.

The host product implements three adapters that core calls on every operation: storage, authorization, and assets. All three receive the trusted caller context first. Terms follow the [glossary](../design/glossary.md); the surrounding flow is in [architecture](../design/architecture.md#shared-update-flow).

## Caller context

```ts
type CallerContext = Readonly<{
  actorId: string;            // host user or service identity
  scope: string;              // host-defined workspace/tenant key
  source: "user" | "agent";   // what produced the operation
  requestId?: string;         // host correlation ID for audit logs
}>;
```

The host constructs this in trusted code. Nothing inside an artifact payload, a tool argument, or a preview message may set or change it.

## Revision envelope

```ts
type ArtifactKind = "html" | "document" | "layout" | "app";
type ChangeOrigin = "user" | "agent" | "restore" | "migration";

type AssetRef = Readonly<{
  assetId: string;
  mediaType: string;
  byteLength: number;
  name?: string;
}>;

type ArtifactRevision = Readonly<{
  artifactId: string;
  scope: string;
  title: string;
  kind: ArtifactKind;
  revision: number;           // 1-based, strictly increasing per artifact
  envelopeVersion: 1;
  adapter: Readonly<{ id: string; schemaVersion: number }>;
  payload: unknown;           // adapter canonical payload, validated by that adapter
  assets: readonly AssetRef[];
  createdAt: string;          // ISO 8601, written by the host or storage backend
  origin: Readonly<{
    source: ChangeOrigin;
    actorId: string;
    restoredFrom?: number;    // present when source is "restore"
    migratedFrom?: number;    // adapter schema version when source is "migration"
  }>;
}>;

type RevisionMeta = Omit<ArtifactRevision, "payload" | "assets">;
```

Example saved revision for an HTML artifact after a user edit:

```json
{
  "artifactId": "art_01J9W2Q4N7",
  "scope": "ws_acme",
  "title": "Tip calculator",
  "kind": "html",
  "revision": 5,
  "envelopeVersion": 1,
  "adapter": { "id": "grapesjs-html", "schemaVersion": 1 },
  "payload": {
    "pages": [{ "id": "p1", "frames": [{ "component": { "type": "wrapper", "components": [] } }] }],
    "styles": [{ "selectors": ["#heading"], "style": { "color": "#1d4ed8" } }]
  },
  "assets": [],
  "createdAt": "2026-10-09T09:12:44.000Z",
  "origin": { "source": "user", "actorId": "u_leo" }
}
```

The payload shape above is illustrative; the HTML adapter defines and validates the real GrapesJS project structure.

## Storage adapter

```ts
type NewRevision = Omit<ArtifactRevision, "revision" | "createdAt">;

type AppendResult =
  | Readonly<{ ok: true; revision: ArtifactRevision }>
  | Readonly<{ ok: false; code: "CONFLICT"; head: RevisionMeta }>;

interface ArtifactStorageAdapter {
  getHead(ctx: CallerContext, artifactId: string): Promise<ArtifactRevision | undefined>;
  getRevision(ctx: CallerContext, artifactId: string, revision: number): Promise<ArtifactRevision | undefined>;
  listRevisions(
    ctx: CallerContext,
    artifactId: string,
    options?: Readonly<{ before?: number; limit?: number }>
  ): Promise<readonly RevisionMeta[]>;
  appendRevision(
    ctx: CallerContext,
    input: Readonly<{ artifactId: string; baseRevision: number | null; revision: NewRevision }>
  ): Promise<AppendResult>;
}
```

Rules the backend must enforce:

- `appendRevision` is atomic. It succeeds only when `baseRevision` equals the current head, or when `baseRevision` is `null` and no revision exists. Two concurrent appends from the same base cannot both succeed.
- The backend assigns `revision` as head plus one and `createdAt` from its own clock. Caller-supplied values for these fields are ignored.
- Revisions are immutable once appended. There is no update or delete method in v1.
- `listRevisions` returns newest first and never includes payloads.
- Every method enforces the backend's own authorization for `ctx.scope`. The SDK-side authorizer below is a convenience layer, not the security boundary.

The reference in-memory adapter shipped for tests implements this interface with a per-artifact mutex. It loses all data on reload and must not be used in production.

## Authorization adapter

```ts
type ArtifactAction = "create" | "read" | "update" | "list_versions" | "restore" | "export";

type AuthorizationDecision =
  | Readonly<{ allowed: true }>
  | Readonly<{ allowed: false; reason?: string }>;

interface ArtifactAuthorizer {
  authorize(
    ctx: CallerContext,
    action: ArtifactAction,
    target: Readonly<{ scope: string; artifactId?: string; kind?: ArtifactKind }>
  ): Promise<AuthorizationDecision>;
}
```

Core calls `authorize` before resolving any revision and again before `appendRevision`. A denial surfaces as `UNAUTHORIZED` from the [embed API](embed-api.md#error-codes) and from tools. Hosts that already authorize inside their storage backend may return `allowed: true` here and rely on the backend; the backend check is mandatory, this one is not.

## Asset adapter

```ts
type ResolvedAsset = Readonly<{
  assetId: string;
  url: string;                // host-authorized, possibly time-limited
  mediaType: string;
  expiresAt?: string;
}>;

interface ArtifactAssetAdapter {
  upload(
    ctx: CallerContext,
    input: Readonly<{ artifactId: string; name: string; mediaType: string; data: Blob | Uint8Array }>
  ): Promise<AssetRef>;
  resolve(ctx: CallerContext, artifactId: string, assetId: string): Promise<ResolvedAsset>;
}
```

Assets are referenced by `assetId` in payloads and in the revision's `assets` list. The host decides whether resolved URLs may reach the isolated preview; the default preview CSP permits none, so the first milestone inlines bounded data URLs instead. Limits, allowed media types, and external URL policy are open in [decision 0004](../decisions/0004-asset-transport-and-export-policy.md).

## Example registration

```ts
import { createArtifactEditor } from "@open-artifacts/embed";

const controller = await createArtifactEditor({
  caller: { actorId: "u_leo", scope: "ws_acme", source: "user" },
  storage: myStorageAdapter,
  authorizer: myAuthorizer,
  assets: myAssetAdapter,
  adapters: [htmlAdapter],
  artifactId: "art_01J9W2Q4N7",
});
```

All three adapters are supplied once per editor instance or tool handler set. They are never serialized into an artifact and never reach the preview iframe.
