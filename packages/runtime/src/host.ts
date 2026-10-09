/**
 * @open-artifacts/runtime/host
 *
 * Trusted host bridge. Runs in the embedding product, binds to one iframe, and
 * answers that iframe's initialize requests with host-validated context.
 * Never load this inside an artifact iframe. See docs/contracts/runtime-sdk.md.
 */

import type {
  ArtifactContext,
  ArtifactTheme,
  Capability,
  InitializeResult,
  JsonRpcError,
  JsonRpcId,
  MessageListenerTarget,
  MessageTarget,
} from "./protocol.js";
import {
  ALL_CAPABILITIES,
  METHOD_CONTEXT_CHANGED,
  METHOD_INITIALIZE,
  METHOD_TEARDOWN,
  PROTOCOL_VERSION,
  createId,
  defaultWindow,
  isCapability,
  isWithinSizeLimit,
  jsonRpcErrors,
  parseContext,
  parseInitializeParams,
  parseMessage,
} from "./protocol.js";

export {
  ArtifactRuntimeError,
  MAX_MESSAGE_BYTES,
  PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "./protocol.js";
export type {
  ArtifactContext,
  ArtifactKind,
  ArtifactRuntimeErrorCode,
  ArtifactTheme,
  Capability,
  ProtocolVersion,
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

function noWindow(): never {
  throw new TypeError("createArtifactHostBridge: no window to listen on");
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
  const hostWindow = options.window ?? defaultWindow() ?? noWindow();

  let context = initial;
  let sessionId = createId();
  /** The document the current session was issued to; undefined until the first initialize. */
  let sessionDocumentId: string | undefined;
  let sequence = 1;
  let disposed = false;

  function send(message: unknown): void {
    try {
      iframe.contentWindow?.postMessage(message, targetOrigin);
    } catch {
      // A navigating or detached frame cannot be reached; the next document starts a new session.
    }
  }

  function sendError(id: JsonRpcId | null, error: JsonRpcError): void {
    send({ jsonrpc: "2.0", id, error });
  }

  function onMessage(event: MessageEvent): void {
    const source = iframe.contentWindow;
    if (!source || event.source !== source) return;
    if (!isWithinSizeLimit(event.data)) return;
    const message = parseMessage(event.data);
    if (!message) return;
    if (message.type === "invalid") {
      // Answer when an id is recoverable so a client is never left pending; otherwise drop.
      if (message.id !== undefined) sendError(message.id, jsonRpcErrors.invalidRequest());
      return;
    }
    if (message.type !== "request") return;

    if (message.method !== METHOD_INITIALIZE) {
      sendError(message.id, jsonRpcErrors.methodNotFound());
      return;
    }
    const params = parseInitializeParams(message.params);
    if (!params) {
      sendError(message.id, jsonRpcErrors.invalidParams());
      return;
    }
    if (!params.protocolVersions.includes(PROTOCOL_VERSION)) {
      sendError(message.id, jsonRpcErrors.protocolMismatch());
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
