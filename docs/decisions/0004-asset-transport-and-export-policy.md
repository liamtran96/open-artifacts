---
title: "0004: Asset transport and export policy"
---

# 0004: Asset transport and export policy

Status: Decided (2026-10-09)
Needed before: Slice 4

## Context

The preview CSP starts with `default-src 'none'`, so images and fonts must either be inlined or explicitly allowed. The host asset adapter can upload and resolve assets, but resolved URLs may be time-limited and may not be reachable from an opaque-origin frame. Exports must decide whether to inline, bundle, or reference assets.

tldraw's default store inlines base64 data URLs into the document, and a custom store implements `upload` and `resolve`, with `resolve` called at render time so signed or scaled URLs are fresh. Excalidraw stores binary files in a separate ID-keyed map and passes them to export. GrapesJS exports to zip only through a plugin. No comparable tool proxies asset bytes through a message channel. tldraw publishes no inline size limit, which is the source of recurring CORS and payload-size issues reported by its users.

## Options

1. First milestone inlines bounded data URLs only; `img-src data:` is the sole CSP relaxation. Uploads are not advertised.
2. Option 1 plus host-resolved URLs for a configured asset origin added to `img-src` and `font-src`, with `resolve` called at preview build time.
3. Proxy all assets through the host bridge as byte messages.

## Decision

Option 1 for slices 2 and 3, option 2 from slice 4. Option 3 is rejected.

Inline policy (from slice 2):

- Images may be embedded as data URLs. The only CSP relaxation is `img-src data:`.
- Limits: 512 KB per inlined asset and 4 MB of inlined assets per revision. The adapter rejects a save that exceeds either with `VALIDATION_FAILED`, naming the offending asset in `details`.
- Media-type allowlist for data URLs: `image/png`, `image/jpeg`, `image/webp`, `image/gif`. SVG is excluded from inline images until a sanitized SVG path exists. Fonts are not inlined.
- Uploads are not advertised in the README until slice 4.

Host-resolved policy (from slice 4):

- The host may configure exactly one asset origin. It is added to `img-src` and `font-src` in the preview CSP; `connect-src` stays `'none'`.
- Artifacts reference assets by stable asset ID. The preview builder calls the asset adapter's `resolve` for every referenced ID when it assembles the frame, so time-limited URLs are fresh at render time. The resolved URL is never stored in the revision.
- `resolve` is authorized by the host under [decision 0005](0005-host-authorization-deployment.md); a denial surfaces as `UNAUTHORIZED` and the preview renders a placeholder.
- Fonts are permitted only from the configured origin as `font/woff2`.

Export policy:

- The default export is a single self-contained file. Inline assets are kept as data URLs; host-resolved assets are fetched at export time and inlined, subject to the same per-asset cap. Assets over the cap are referenced by their resolved URL and the export result lists them as external.
- A zip export that places assets in an `assets/` folder is a later capability and is not advertised until implemented.

Option 3 was rejected because it turns the trusted bridge into a file transport, widening the only channel between host and preview for no isolation gain.

## Consequences

- Data URL caps, the media-type allowlist, and the single-origin rule are fixed constants in the HTML adapter and runtime contract.
- Exports are single-file by default; zip is a future record.
- The README may advertise inline images from slice 2 and uploads only after slice 4 ships with tests.
- End-to-end tests cover a cap violation, a disallowed media type, a stale resolved URL refreshed at build time, and an `UNAUTHORIZED` resolve.
