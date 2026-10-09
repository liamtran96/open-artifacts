# Agent tools contract

Status: Proposed v1 tool schemas for packages/tools; not implemented. Delivered in slice 3 of the [implementation plan](../plans/2026-10-09-sdk-implementation-plan.md).

Tools are provider-independent: the package exports JSON Schema definitions plus handler functions, and the host adapts them to its model provider's tool-calling format. Handlers call the same core operations as the [embed API](embed-api.md) with a caller context whose `source` is `agent`. They never bypass authorization, validation, or the atomic save path.

```ts
import { createArtifactTools } from "@open-artifacts/tools";

const tools = createArtifactTools({ caller, storage, authorizer, adapters });
// tools.definitions: readonly ToolDefinition[]   -> hand to the model provider
// tools.handle(name, input): Promise<ToolResult> -> call when the model invokes a tool
```

Every tool result is a JSON object with `ok: true` and a payload, or `ok: false` with an `error` of the [ArtifactError](embed-api.md#error-codes) shape. The host returns the full result to the model so it can recover, especially from `CONFLICT`.

## create_artifact

Input:

```json
{
  "type": "object",
  "required": ["kind", "title", "payload"],
  "properties": {
    "kind": { "type": "string", "enum": ["html", "document", "layout", "app"] },
    "adapterId": { "type": "string", "description": "Optional; defaults to the single registered adapter for the kind" },
    "title": { "type": "string", "minLength": 1, "maxLength": 200 },
    "payload": { "description": "Canonical payload for the adapter; validated by the adapter's schema" }
  }
}
```

Output:

```json
{ "ok": true, "artifactId": "art_01J9W2Q4N7", "revision": 1, "kind": "html", "adapter": { "id": "grapesjs-html", "schemaVersion": 1 } }
```

For HTML, the host may expose a higher-level helper that accepts HTML/CSS and converts it into project JSON before calling this tool. The conversion is an adapter concern and the saved payload is always project JSON.

## read_artifact

Input:

```json
{
  "type": "object",
  "required": ["artifactId"],
  "properties": {
    "artifactId": { "type": "string" },
    "revision": { "type": "integer", "minimum": 1, "description": "Optional; defaults to head" },
    "include": {
      "type": "array",
      "items": { "type": "string", "enum": ["payload", "outline", "operations"] },
      "default": ["outline", "operations"]
    }
  }
}
```

Output:

```json
{
  "ok": true,
  "artifactId": "art_01J9W2Q4N7",
  "revision": 5,
  "title": "Tip calculator",
  "kind": "html",
  "outline": [{ "id": "heading", "type": "text", "text": "Tip calculator" }],
  "operations": { "set_text": { "description": "...", "inputSchema": {} } },
  "payload": null
}
```

`outline` is an adapter-defined, token-efficient summary with stable component IDs the agent can target. `operations` lists the adapter's supported operation names with their input schemas. Full `payload` is returned only when requested.

## update_artifact

Input:

```json
{
  "type": "object",
  "required": ["artifactId", "baseRevision", "operations"],
  "properties": {
    "artifactId": { "type": "string" },
    "baseRevision": { "type": "integer", "minimum": 1 },
    "title": { "type": "string", "minLength": 1, "maxLength": 200 },
    "operations": {
      "type": "array",
      "minItems": 1,
      "maxItems": 100,
      "items": {
        "type": "object",
        "required": ["op"],
        "properties": { "op": { "type": "string" } },
        "additionalProperties": true
      }
    }
  }
}
```

Each item is validated against the adapter's input schema for its `op`. The batch is applied as one transaction: all operations succeed or none are saved. Illustrative HTML operations for the first milestone:

| op | Arguments |
| --- | --- |
| `set_text` | `{ "componentId": string, "text": string }` |
| `set_style` | `{ "componentId": string, "property": string, "value": string }` |
| `insert_component` | `{ "parentId": string, "index": number, "component": AllowedComponent }` |
| `remove_component` | `{ "componentId": string }` |

The allowed component set is open in [decision 0003](../decisions/0003-html-component-and-script-allowlist.md).

Success output:

```json
{ "ok": true, "artifactId": "art_01J9W2Q4N7", "revision": 6, "baseRevision": 5 }
```

Conflict output:

```json
{
  "ok": false,
  "error": {
    "code": "CONFLICT",
    "message": "baseRevision 4 is behind head 5",
    "details": { "head": { "revision": 5, "createdAt": "2026-10-09T09:12:44.000Z", "origin": { "source": "user", "actorId": "u_leo" } } }
  }
}
```

On conflict the agent must call `read_artifact` for the head, re-plan its change against the current outline, and retry with the new `baseRevision`. Handlers never auto-merge.

## list_artifact_versions

Input:

```json
{
  "type": "object",
  "required": ["artifactId"],
  "properties": {
    "artifactId": { "type": "string" },
    "before": { "type": "integer", "minimum": 1 },
    "limit": { "type": "integer", "minimum": 1, "maximum": 100, "default": 20 }
  }
}
```

Output:

```json
{
  "ok": true,
  "artifactId": "art_01J9W2Q4N7",
  "head": 6,
  "versions": [
    { "revision": 6, "title": "Tip calculator", "createdAt": "...", "origin": { "source": "agent", "actorId": "svc_assistant" } },
    { "revision": 5, "title": "Tip calculator", "createdAt": "...", "origin": { "source": "user", "actorId": "u_leo" } }
  ]
}
```

Payloads are never included.

## restore_artifact_version

Input:

```json
{
  "type": "object",
  "required": ["artifactId", "revision", "baseRevision"],
  "properties": {
    "artifactId": { "type": "string" },
    "revision": { "type": "integer", "minimum": 1, "description": "Revision whose payload becomes the new head" },
    "baseRevision": { "type": "integer", "minimum": 1, "description": "Expected current head; conflict if it has moved" }
  }
}
```

Output:

```json
{ "ok": true, "artifactId": "art_01J9W2Q4N7", "revision": 7, "restoredFrom": 2 }
```

Restore is append-only and returns `CONFLICT` under the same rule as update.

## Guidance for tool descriptions

The description text handed to the model should state three rules: read before update, prefer targeted operations over replacing the whole payload, and retry from the head after a conflict. The package ships these descriptions; hosts may append product-specific notes but should not remove them.

## Out of scope for v1

Tools that execute code inside artifacts, read host product data, or stream partial updates are later capability contracts. MCP exposure of these same tools is a possible adapter and is tracked in [architecture](../design/architecture.md#extension-and-maintenance).
