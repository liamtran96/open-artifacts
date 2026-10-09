/**
 * Trusted host bridge. Runs in the embedding product, binds to one iframe, and
 * answers that iframe's initialize requests with host-validated context.
 * See docs/contracts/runtime-sdk.md. Published as @open-artifacts/runtime/host.
 */

import type {
  ArtifactContext,
  ArtifactTheme,
  Capability,
  InitializeResult,
  MessageListenerTarget,
  MessageTarget,
} from "./protocol.js";
import {
  ALL_CAPABILITIES,
  JSON_RPC_INVALID_PARAMS,
  JSON_RPC_INVALID_REQUEST,
  JSON_RPC_METHOD_NOT_FOUND,
  JSON_RPC_PROTOCOL_MISMATCH,
  METHOD_CONTEXT_CHANGED,
  METHOD_INITIALIZE,
  METHOD_TEARDOWN,
  PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  createId,
  isCapability,
  isWithinSizeLimit,
  parseContext,
  parseInitializeParams,
  parseMessage,
} from "./protocol.js";

/** The subset of an HTMLIFrameElement the bridge needs. Tests pass doubles. */
export interface HostFrame {
  readonly contentWindow: MessageTarget | null;
}

/** Mutable part of the context. Identity, kind, and revision are fixed for the session. */
export interface ContextUpdate {
  theme?: ArtifactTheme;
  locale?: string;
}

export interface ArtifactHostBridgeOptions {
  iframe: HostFrame;
  /** Host-validated context. The bridge never accepts replacements from the artifact. */
  context: ArtifactContext;
  /** Capabilities the host policy grants. Default: all v1 capabilities. */
  capabilities?: readonly Capability[];
  /** Origin passed to postMessage. Opaque-origin sandboxes require "*", the default. */
  targetOrigin?: string;
  /** Window that receives the iframe's messages. Defaults to globalThis.window. */
  window?: MessageListenerTarget;
}

export interface ArtifactHostBridge {
  /** Publish changed theme and/or locale. No-op when nothing changes. */
  setContext(update: ContextUpdate): void;
  /** The context the host currently publishes. */
  getContext(): ArtifactContext;
  /** Current session identifier; a new document in the frame starts a new one. */
  readonly sessionId: string;
  /** Idempotent: removes listeners and sends teardown to the frame when it exists. */
  dispose(): void;
}

function defaultWindow(): MessageListenerTarget | undefined {
  const w = (globalThis as { window?: unknown }).window;
  return typeof w === "object" && w !== null ? (w as MessageListenerTarget) : undefined;
}

export function createArtifactHostBridge(options: ArtifactHostBridgeOptions): ArtifactHostBridge {
  const initial = parseContext(options.context);
  if (!initial) throw new TypeError("createArtifactHostBridge: invalid host context");
  const requested = options.capabilities ?? ALL_CAPABILITIES;
  if (!requested.every(isCapability)) {
    throw new TypeError("createArtifactHostBridge: unknown capability");
  }
  const capabilities: readonly Capability[] = Object.freeze([...new Set(requested)]);
  const targetOrigin = options.targetOrigin ?? "*";
  const { iframe } = options;
  const listenerTarget = options.window ?? defaultWindow();
  if (!listenerTarget) throw new TypeError("createArtifactHostBridge: no window to listen on");
  const hostWindow: MessageListenerTarget = listenerTarget;

  let context = initial;
  let sessionId = createId();
  /** The document the current session was issued to; undefined until the first initialize. */
  let sessionDocumentId: string | undefined;
  let sequence = 1;
  let disposed = false;

  function send(message: unknown): void {
    const target = iframe.contentWindow;
    if (!target) return;
    try {
      target.postMessage(message, targetOrigin);
    } catch {
      // A navigating or detached frame cannot be reached; the next load rebinds the session.
    }
  }

  function sendError(
    id: string | number | null,
    code: number,
    message: string,
    data?: Record<string, unknown>,
  ): void {
    send({ jsonrpc: "2.0", id, error: data ? { code, message, data } : { code, message } });
  }

  function onMessage(event: MessageEvent): void {
    const source = iframe.contentWindow;
    if (!source || event.source !== source) return;
    if (!isWithinSizeLimit(event.data)) return;
    const message = parseMessage(event.data);
    if (!message) {
      // Malformed traffic from the bound frame: answer when an id is recoverable so a
      // client is never left pending, otherwise drop it.
      const id = (event.data as { id?: unknown } | null)?.id;
      if (typeof id === "string" || typeof id === "number") {
        sendError(id, JSON_RPC_INVALID_REQUEST, "Invalid Request", { code: "INVALID_MESSAGE" });
      }
      return;
    }
    if (message.type !== "request") return;

    if (message.method !== METHOD_INITIALIZE) {
      sendError(message.id, JSON_RPC_METHOD_NOT_FOUND, "Method not found");
      return;
    }
    const params = parseInitializeParams(message.params);
    if (!params) {
      sendError(message.id, JSON_RPC_INVALID_PARAMS, "Invalid params", { code: "INVALID_MESSAGE" });
      return;
    }
    if (!params.protocolVersions.includes(PROTOCOL_VERSION)) {
      sendError(message.id, JSON_RPC_PROTOCOL_MISMATCH, "Unsupported protocol version", {
        code: "PROTOCOL_MISMATCH",
        supportedProtocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
      });
      return;
    }
    if (sessionDocumentId !== undefined && sessionDocumentId !== params.documentId) {
      // A different document now lives in the frame: the old session must not survive it.
      sessionId = createId();
    }
    sessionDocumentId = params.documentId;
    const result: InitializeResult = {
      protocolVersion: PROTOCOL_VERSION,
      capabilities,
      context,
      sessionId,
      sequence,
    };
    send({ jsonrpc: "2.0", id: message.id, result });
  }

  function setContext(update: ContextUpdate): void {
    if (disposed) throw new Error("ArtifactHostBridge has been disposed");
    const next = parseContext({ ...context, ...update });
    if (!next) throw new TypeError("setContext: invalid theme or locale");
    if (next.theme === context.theme && next.locale === context.locale) return;
    context = next;
    sequence += 1;
    send({
      jsonrpc: "2.0",
      method: METHOD_CONTEXT_CHANGED,
      params: { sessionId, sequence, context },
    });
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    hostWindow.removeEventListener("message", onMessage);
    send({ jsonrpc: "2.0", method: METHOD_TEARDOWN, params: { sessionId } });
  }

  hostWindow.addEventListener("message", onMessage);

  return {
    setContext,
    getContext: () => context,
    get sessionId() {
      return sessionId;
    },
    dispose,
  };
}
