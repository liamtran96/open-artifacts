# Glossary

Status: Shared vocabulary for the design documents. Terms here are normative; when another document uses a term differently, fix that document.

| Term | Meaning |
| --- | --- |
| Artifact | One editable unit owned by a host scope, identified by a stable artifact ID, with a kind and a sequence of saved revisions. |
| Kind | The artifact category that selects an adapter family: `html`, `document`, `layout`, or `app`. |
| Adapter | The package that owns a kind's canonical payload: schema, validation, migrations, supported operations, serialization, derived outputs, and exports. Registered by adapter ID. |
| Adapter view | The DOM-bound editor surface for an adapter, registered in embed against the same adapter ID. Core never imports it. |
| Canonical payload | The adapter's editable source stored in a revision, such as GrapesJS project JSON. Previews and exports are derived from it and never replace it. |
| Revision | An immutable saved snapshot of an artifact: envelope metadata plus canonical payload. Numbered from 1 and strictly increasing per artifact. |
| Head | The highest revision number currently saved for an artifact. |
| Base revision | The revision a draft or an update was derived from. Storage compares it to the head atomically on save. |
| Conflict | The structured result returned when the base revision is not the head. The caller reads the head and retries; nothing is overwritten. |
| Envelope | The revision fields outside the payload: IDs, scope, title, kind, numbers, adapter identity, assets, time, and origin. Versioned by `envelopeVersion`. |
| Adapter schema version | The version of the payload format. Migrations move a copy of an old payload forward; saved history is never rewritten. |
| Draft | The in-memory editable document in one editor instance, derived from a base revision plus unsaved changes. |
| Draft generation | A local counter incremented on every successful draft transaction. `applyChanges` rejects a batch whose expected generation is stale. Never persisted. |
| Draft transaction | One validated batch of operations applied atomically to the draft. It produces one document-change event and one undo group. It is not a save. |
| Operation | One targeted, adapter-defined change such as setting a component's text or style property. Identified by a stable operation name and validated by the adapter. |
| Session state | Per-editor, per-user UI state such as selection, active panel, theme, and locale. Never saved into a revision and never restored from another user's session. |
| Context | The public, read-only subset of session state published to the isolated preview: artifact ID, viewed revision, kind, theme, locale. |
| Viewed revision | The revision a preview iframe is rendering. Immutable within a bridge session. |
| Bridge session | One host-bridge-to-iframe connection identified by a session ID. A frame load creates a new session. |
| Capability | A named permission the host may grant to a bridge session. Declared by the client, selected by host policy, enforced by the host. |
| Change origin | Who produced a revision: `user`, `agent`, `restore`, or `migration`. Recorded by the trusted host, not by the artifact. |
| Caller context | The trusted identity and scope the host attaches to every core operation. Artifact payloads cannot set it. |
| Scope | A host-defined key such as a workspace or tenant that groups artifacts for authorization and listing. |
| Restore | Creating a new head revision whose payload is copied from an earlier revision. Append-only; it never deletes history. |
| Slot | A named region of the default editor shell, such as toolbar or version panel, that a host can hide or replace. |
| Trusted host API | The embed, React, tools, and host-adapter surfaces that run in the host page with full authority. |
| Runtime API | The narrow client inside the preview iframe. It receives context and capabilities only and can never write a revision. |
