---
title: "Trusted embed API"
---

# Trusted embed API

Status: Proposed v1 surface for packages/embed and packages/react; not implemented. Pairs with the [host adapter contracts](host-adapters.md) and the [runtime contract](runtime-sdk.md), which covers the untrusted iframe side.

Everything here runs in the host page with full authority. Nothing here is reachable from inside a preview iframe.

## Creating an editor

```ts
import { createArtifactEditor, mountArtifactEditor } from "@open-artifacts/embed";

type CreateEditorOptions = Readonly<{
  caller: CallerContext;
  storage: ArtifactStorageAdapter;
  authorizer: ArtifactAuthorizer;
  assets?: ArtifactAssetAdapter;
  adapters: readonly RegisteredAdapter[];
  artifactId: string;
  revision?: number;          // open a specific revision read-only; default is head
}>;

declare function createArtifactEditor(options: CreateEditorOptions): Promise<ArtifactEditorController>;

type MountOptions = CreateEditorOptions & Readonly<{
  session?: Readonly<{ theme?: "light" | "dark"; locale?: string }>;
  slots?: Partial<Record<SlotName, SlotFactory | false>>;
  previewOrigin?: string;     // origin that serves preview documents; default is an opaque srcdoc frame
}>;

type ArtifactEditorHandle = Readonly<{
  controller: ArtifactEditorController;
  setSession(patch: Readonly<{ theme?: "light" | "dark"; locale?: string }>): void;
  unmount(): void;
}>;

declare function mountArtifactEditor(container: HTMLElement, options: MountOptions): Promise<ArtifactEditorHandle>;
```

`createArtifactEditor` is usable in tests and in tool handlers without a DOM. `mountArtifactEditor` creates the controller, loads the adapter view for the artifact's kind on demand, renders the default shell, and attaches the preview bridge. `unmount` disposes the controller, removes views and slot callbacks, closes preview connections, and is idempotent.

## Creating a new artifact

```ts
declare function createArtifact(
  deps: Pick<CreateEditorOptions, "caller" | "storage" | "authorizer" | "adapters">,
  input: Readonly<{ kind: ArtifactKind; adapterId: string; title: string; payload: unknown }>
): Promise<ArtifactRevision>;
```

The adapter validates `payload` before revision 1 is appended. The returned revision's `artifactId` is then passed to `createArtifactEditor` or to tools.

## Controller

```ts
interface ArtifactEditorController {
  getSnapshot(): EditorSnapshot;
  subscribe<E extends keyof EditorEvents>(event: E, listener: (payload: EditorEvents[E]) => void): () => void;
  applyChanges(input: ApplyChangesInput): ApplyChangesResult;
  undo(): boolean;
  redo(): boolean;
  save(input?: Readonly<{ title?: string }>): Promise<SaveResult>;
  restore(revision: number): Promise<SaveResult>;
  listRevisions(options?: Readonly<{ before?: number; limit?: number }>): Promise<readonly RevisionMeta[]>;
  export(format: string): Promise<ExportResult>;
  notifyExternalRevision(head: RevisionMeta): void;
  dispose(): void;
}

type EditorSnapshot = Readonly<{
  artifactId: string;
  kind: ArtifactKind;
  adapter: Readonly<{ id: string; schemaVersion: number }>;
  saved: Readonly<{ head: RevisionMeta; baseRevision: number }>;
  draft: Readonly<{ document: unknown; generation: number; dirty: boolean; canUndo: boolean; canRedo: boolean }>;
  session: Readonly<{ theme: "light" | "dark"; locale: string; selection?: unknown; activePanel?: SlotName }>;
  status: "loading" | "ready" | "saving" | "conflict" | "error" | "disposed";
}>;

type ApplyChangesInput = Readonly<{
  operations: readonly AdapterOperation[];
  expectedDraftGeneration: number;
  source: "ui" | "agent" | "external";
}>;

type ApplyChangesResult =
  | Readonly<{ ok: true; generation: number }>
  | Readonly<{ ok: false; error: ArtifactError }>;

type SaveResult =
  | Readonly<{ ok: true; revision: ArtifactRevision }>
  | Readonly<{ ok: false; error: ArtifactError }>;   // CONFLICT carries the current head in details

type ExportResult = Readonly<{
  format: string;
  mediaType: string;
  files: readonly Readonly<{ name: string; data: Blob }>[];
}>;
```

Behavior:

- `applyChanges` is synchronous and atomic. If any operation fails validation, the draft, generation, and history are unchanged and the result carries the error. On success it emits one `document-change` event and pushes one undo group.
- `save` uses `saved.baseRevision` for the storage compare. On success it updates `saved`, resets `dirty`, and emits `saved`. On `CONFLICT` it leaves the draft intact, sets status to `conflict`, and emits `conflict`.
- `restore` appends a new head whose payload is the chosen revision's payload, migrated if its schema version is old. It fails with `CONFLICT` if the draft is dirty; save or discard first.
- `undo` and `redo` change only the draft. Returning `false` means the stack was empty.
- `notifyExternalRevision` is how the host reports a newer head seen through its own channels, such as a websocket. A clean draft rebases to the new head; a dirty draft is preserved and `external-revision` is emitted so the shell can prompt for reconciliation.
- Session changes never set `dirty` and never create a revision.
- After `dispose`, every method except `getSnapshot` throws `DISPOSED`; `getSnapshot` reports status `disposed`.

## Events

```ts
type EditorEvents = {
  "document-change": Readonly<{ generation: number; source: "ui" | "agent" | "external"; operations: readonly AdapterOperation[] }>;
  "session-change": Readonly<{ session: EditorSnapshot["session"] }>;
  "saved": Readonly<{ revision: RevisionMeta }>;
  "conflict": Readonly<{ baseRevision: number; head: RevisionMeta }>;
  "external-revision": Readonly<{ head: RevisionMeta; draftDirty: boolean }>;
  "preview-error": Readonly<{ revision: number; message: string; stack?: string }>;
  "status-change": Readonly<{ status: EditorSnapshot["status"] }>;
};
```

Listener exceptions are caught and logged; they never block delivery to other listeners. Every `subscribe` call returns an idempotent unsubscribe function, and `dispose` removes all remaining listeners.

## Adapter registration

```ts
type RegisteredAdapter = Readonly<{
  id: string;
  kind: ArtifactKind;
  schemaVersion: number;
  validate(payload: unknown): ValidationResult;
  migrate(payload: unknown, fromVersion: number): unknown;
  operations: Readonly<Record<string, OperationDefinition>>;
  applyOperation(document: unknown, operation: AdapterOperation): unknown;   // returns a new document; never mutates
  deriveOutputs(document: unknown): Readonly<{ preview: PreviewDocument; exports: readonly string[] }>;
  export(document: unknown, format: string): Promise<ExportResult>;
}>;

type AdapterOperation = Readonly<{ op: string; [arg: string]: unknown }>;

type OperationDefinition = Readonly<{
  description: string;
  inputSchema: JsonSchema;     // exposed to agents through packages/tools
}>;

type ValidationResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; issues: readonly Readonly<{ path: string; reason: string }>[] }>;

type PreviewDocument = Readonly<{ html: string; csp: string; runtimeVersion: string }>;
```

Embed registers the view separately so core stays DOM-free:

```ts
import { registerAdapterView } from "@open-artifacts/embed";

registerAdapterView("grapesjs-html", (controller, container) => {
  // mount the GrapesJS editor, translate its native changes into controller.applyChanges
  return { destroy() {} };
});
```

Registration fails before an artifact opens when two adapters share an ID, when an adapter's kind does not match the artifact's kind, or when the artifact's schema version is newer than the adapter's.

## Slots

```ts
type SlotName = "toolbar" | "inspector" | "versions" | "status" | "preview";

type SlotFactory = (
  ctx: Readonly<{ controller: ArtifactEditorController; container: HTMLElement }>
) => Readonly<{ destroy(): void }>;
```

Passing `false` hides a slot. A custom slot receives the same controller as the defaults and must issue controller commands rather than touching adapter internals or storage. The React wrapper accepts React components for the same names and translates them to this contract.

## React wrapper

```tsx
import { ArtifactEditor, useArtifactEditor, useEditorSnapshot } from "@open-artifacts/react";

<ArtifactEditor
  {...createEditorOptions}
  session={{ theme, locale }}
  slots={{ toolbar: MyToolbar }}
  onReady={(controller) => {}}
  onConflict={(event) => {}}
/>;
```

`useArtifactEditor()` returns the controller from context. `useEditorSnapshot(selector)` subscribes with a selector so a component re-renders only when its selected slice changes. The wrapper owns mount and unmount parity with the plain API and adds no persistence path of its own.

## Error codes

```ts
type ArtifactErrorCode =
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_FAILED"
  | "STALE_DRAFT"
  | "UNSUPPORTED_OPERATION"
  | "UNSUPPORTED_SCHEMA"
  | "ADAPTER_NOT_REGISTERED"
  | "STORAGE_FAILURE"
  | "DISPOSED";

type ArtifactError = Readonly<{
  code: ArtifactErrorCode;
  message: string;
  details?: unknown;   // CONFLICT: { head: RevisionMeta }; VALIDATION_FAILED: ValidationResult issues
}>;
```

| Code | Raised when |
| --- | --- |
| UNAUTHORIZED | The authorizer or storage backend denied the action |
| NOT_FOUND | The artifact or revision does not exist in the caller's scope |
| CONFLICT | `baseRevision` is not the head, or restore was attempted on a dirty draft |
| VALIDATION_FAILED | The adapter rejected a payload or an operation's arguments |
| STALE_DRAFT | `expectedDraftGeneration` does not match the current generation |
| UNSUPPORTED_OPERATION | The operation name is not defined by the adapter |
| UNSUPPORTED_SCHEMA | The payload's schema version is newer than the adapter, or no migration exists |
| ADAPTER_NOT_REGISTERED | No adapter or adapter view matches the artifact's adapter ID |
| STORAGE_FAILURE | The storage adapter threw or returned an invalid result |
| DISPOSED | The controller was used after `dispose` |

The runtime iframe client has its own code set, listed in the [runtime contract](runtime-sdk.md#protocol-and-lifecycle). The two sets share only `DISPOSED`.
