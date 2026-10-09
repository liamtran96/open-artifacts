/**
 * Artifact-side client. Runs inside the isolated preview iframe and talks to the
 * trusted host bridge over JSON-RPC/postMessage. See docs/contracts/runtime-sdk.md.
 */

import type {
  ArtifactContext,
  ClientWindow,
  Connection,
  ContextChangedParams,
  JsonRpcError,
  JsonRpcId,
  MessageTarget,
} from "./protocol.js";

export type { ClientWindow } from "./protocol.js";
import {
  ArtifactRuntimeError,
  DEFAULT_CONNECT_TIMEOUT_MS,
  DEFAULT_RETRY_INTERVAL_MS,
  JSON_RPC_METHOD_NOT_FOUND,
  METHOD_CONTEXT_CHANGED,
  METHOD_INITIALIZE,
  METHOD_TEARDOWN,
  SUPPORTED_PROTOCOL_VERSIONS,
  assertPositiveFinite,
  createId,
  defaultWindow,
  documentIdFor,
  isProtocolVersion,
  isWithinSizeLimit,
  jsonRpcErrors,
  parseContextChangedParams,
  parseInitializeResult,
  parseMessage,
  parseTeardownParams,
  sdkErrorCodeOf,
} from "./protocol.js";

export type ArtifactClientStatus =
  "idle" | "connecting" | "connected" | "disconnected" | "disposed";

export type ContextListener = (context: ArtifactContext) => void;

export type StatusListener = (status: ArtifactClientStatus) => void;

export interface ArtifactClient {
  /** Negotiate with the host. Repeated calls share the in-flight attempt or return the active connection. */
  connect(): Promise<Connection>;
  context: {
    /** Latest immutable snapshot; undefined before connection and after teardown or disposal. */
    get(): ArtifactContext | undefined;
    /** Emits the current snapshot (if any) immediately and every changed snapshot afterwards. */
    subscribe(listener: ContextListener): () => void;
  };
  /** Current lifecycle phase. */
  readonly status: ArtifactClientStatus;
  /** Emits every status transition; returns an idempotent unsubscribe. Does not emit the current value. */
  subscribeStatus(listener: StatusListener): () => void;
  /** Idempotent and terminal: releases listeners and timers, rejects pending work with DISPOSED. */
  dispose(): void;
}

export interface ArtifactClientOptions {
  /** Defaults to globalThis.window. */
  window?: ClientWindow;
  /** Origin passed to postMessage; "*" is required when the host origin is unknown. */
  targetOrigin?: string;
  /** Overall deadline for initialization. Default 5000 ms. */
  timeoutMs?: number;
  /** Interval between repeated initialize requests. Default 250 ms. */
  retryIntervalMs?: number;
  /** Called when a subscriber throws; defaults to console.error. */
  onListenerError?: (error: unknown) => void;
}

/** Upper bound on sessions whose notifications are buffered during initialization. */
const MAX_QUEUED_SESSIONS = 8;

type Timer = ReturnType<typeof setTimeout>;

interface PendingAttempt {
  requestId: string;
  promise: Promise<Connection>;
  resolve: (connection: Connection) => void;
  reject: (error: ArtifactRuntimeError) => void;
  retryTimer: Timer | undefined;
  deadlineTimer: Timer | undefined;
  /**
   * Newest context notification per session received while initializing. The session id is
   * unknown until the result arrives, so one entry per observed session is kept (bounded).
   */
  queued: Map<string, ContextChangedParams>;
}

interface ActiveSession {
  connection: Connection;
  sessionId: string;
  sequence: number;
}

function defaultListenerError(error: unknown): void {
  console.error("[open-artifacts] context listener threw", error);
}

/** Translate a host's JSON-RPC error reply to initialize into the SDK's error vocabulary. */
function hostErrorToRuntimeError(error: JsonRpcError): ArtifactRuntimeError {
  const sdkCode = sdkErrorCodeOf(error);
  if (sdkCode) return new ArtifactRuntimeError(sdkCode, error.message);
  // A parent that answers JSON-RPC but lacks oa/initialize is a foreign host, not a bug.
  if (error.code === JSON_RPC_METHOD_NOT_FOUND) {
    return new ArtifactRuntimeError(
      "PROTOCOL_MISMATCH",
      `Host does not implement ${METHOD_INITIALIZE}`,
    );
  }
  return new ArtifactRuntimeError(
    "INVALID_MESSAGE",
    `Host rejected initialization: ${error.message}`,
  );
}

export function createArtifactClient(options: ArtifactClientOptions = {}): ArtifactClient {
  const timeoutMs = options.timeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
  const retryIntervalMs = options.retryIntervalMs ?? DEFAULT_RETRY_INTERVAL_MS;
  assertPositiveFinite("timeoutMs", timeoutMs);
  assertPositiveFinite("retryIntervalMs", retryIntervalMs);
  const targetOrigin = options.targetOrigin ?? "*";
  const onListenerError = options.onListenerError ?? defaultListenerError;

  const self = options.window ?? defaultWindow();
  // A top-level document has itself as parent; treat both that and a missing parent as no host.
  const parent: MessageTarget | undefined =
    self && self.parent !== null && (self.parent as unknown) !== self ? self.parent : undefined;

  let status: ArtifactClientStatus = "idle";
  let pending: PendingAttempt | undefined;
  let session: ActiveSession | undefined;
  let context: ArtifactContext | undefined;
  let listening = false;
  const documentId = self ? documentIdFor(self) : createId();
  const listeners = new Set<ContextListener>();
  const statusListeners = new Set<StatusListener>();

  /** Call one subscriber, isolating its failure from the caller and from other subscribers. */
  function safeCall<T>(listener: (value: T) => void, value: T): void {
    try {
      listener(value);
    } catch (error) {
      onListenerError(error);
    }
  }

  function setStatus(next: ArtifactClientStatus): void {
    if (status === next) return;
    status = next;
    for (const listener of [...statusListeners]) safeCall(listener, next);
  }

  function startListening(): void {
    if (listening || !self) return;
    self.addEventListener("message", onMessage);
    listening = true;
  }

  function stopListening(): void {
    if (!listening || !self) return;
    self.removeEventListener("message", onMessage);
    listening = false;
  }

  function applyContext(next: ArtifactContext): void {
    context = next;
    for (const listener of [...listeners]) safeCall(listener, next);
  }

  function clearAttemptTimers(attempt: PendingAttempt): void {
    if (attempt.retryTimer !== undefined) clearInterval(attempt.retryTimer);
    if (attempt.deadlineTimer !== undefined) clearTimeout(attempt.deadlineTimer);
    attempt.retryTimer = undefined;
    attempt.deadlineTimer = undefined;
  }

  function failAttempt(error: ArtifactRuntimeError): void {
    const attempt = pending;
    if (!attempt) return;
    pending = undefined;
    clearAttemptTimers(attempt);
    if (status !== "disposed") {
      setStatus("idle");
      stopListening();
    }
    attempt.reject(error);
  }

  function post(message: unknown): void {
    try {
      parent?.postMessage(message, targetOrigin);
    } catch {
      // A detached or closed parent surfaces as a timeout rather than a thrown error.
    }
  }

  function sendInitialize(requestId: string): void {
    post({
      jsonrpc: "2.0",
      id: requestId,
      method: METHOD_INITIALIZE,
      params: { protocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS], documentId },
    });
  }

  function handleResponse(id: JsonRpcId, result: unknown): void {
    const attempt = pending;
    if (attempt?.requestId !== id) return;
    const parsed = parseInitializeResult(result);
    if (!parsed) {
      failAttempt(
        new ArtifactRuntimeError("INVALID_MESSAGE", "Host returned a malformed initialize result"),
      );
      return;
    }
    if (!isProtocolVersion(parsed.protocolVersion)) {
      failAttempt(
        new ArtifactRuntimeError(
          "PROTOCOL_MISMATCH",
          `Host selected protocol version ${String(parsed.protocolVersion)}; this client supports ${SUPPORTED_PROTOCOL_VERSIONS.join(", ")}`,
        ),
      );
      return;
    }
    const protocolVersion = parsed.protocolVersion;
    pending = undefined;
    clearAttemptTimers(attempt);
    setStatus("connected");
    session = {
      connection: Object.freeze({
        protocolVersion,
        capabilities: parsed.capabilities,
        context: parsed.context,
      }),
      sessionId: parsed.sessionId,
      sequence: parsed.sequence,
    };
    const queued = attempt.queued.get(parsed.sessionId);
    if (queued && queued.sequence > parsed.sequence) {
      session.sequence = queued.sequence;
      applyContext(queued.context);
    } else {
      applyContext(parsed.context);
    }
    attempt.resolve(session.connection);
  }

  function handleError(id: JsonRpcId | null, error: JsonRpcError): void {
    if (pending?.requestId !== id) return;
    failAttempt(hostErrorToRuntimeError(error));
  }

  function handleContextChanged(params: unknown): void {
    const parsed = parseContextChangedParams(params);
    if (!parsed) return;
    if (pending) {
      const existing = pending.queued.get(parsed.sessionId);
      if (existing && existing.sequence >= parsed.sequence) return;
      if (!existing && pending.queued.size >= MAX_QUEUED_SESSIONS) return;
      pending.queued.set(parsed.sessionId, parsed);
      return;
    }
    if (session?.sessionId !== parsed.sessionId || parsed.sequence <= session.sequence) return;
    session.sequence = parsed.sequence;
    applyContext(parsed.context);
  }

  function handleTeardown(params: unknown): void {
    const parsed = parseTeardownParams(params);
    if (!parsed || session?.sessionId !== parsed.sessionId) return;
    session = undefined;
    context = undefined;
    setStatus("disconnected");
    stopListening();
  }

  function onMessage(event: MessageEvent): void {
    if (parent === undefined || event.source !== parent) return;
    if (!isWithinSizeLimit(event.data)) return;
    const message = parseMessage(event.data);
    if (!message) return;
    switch (message.type) {
      case "response":
        handleResponse(message.id, message.result);
        break;
      case "error":
        handleError(message.id, message.error);
        break;
      case "notification":
        if (message.method === METHOD_CONTEXT_CHANGED) handleContextChanged(message.params);
        else if (message.method === METHOD_TEARDOWN) handleTeardown(message.params);
        break;
      case "request":
        // v1 exposes no client-side methods.
        post({ jsonrpc: "2.0", id: message.id, error: jsonRpcErrors.methodNotFound() });
        break;
      case "invalid":
        // The host is trusted; its malformed traffic is dropped, never answered.
        break;
    }
  }

  function connect(): Promise<Connection> {
    if (status === "disposed") {
      return Promise.reject(new ArtifactRuntimeError("DISPOSED", "Client has been disposed"));
    }
    if (session) return Promise.resolve(session.connection);
    if (pending) return pending.promise;
    if (!parent) {
      return Promise.reject(
        new ArtifactRuntimeError(
          "HOST_UNAVAILABLE",
          "No parent window: the artifact is not embedded in a host",
        ),
      );
    }

    let resolve!: (connection: Connection) => void;
    let reject!: (error: ArtifactRuntimeError) => void;
    const promise = new Promise<Connection>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const attempt: PendingAttempt = {
      requestId: createId(),
      promise,
      resolve,
      reject,
      retryTimer: undefined,
      deadlineTimer: undefined,
      queued: new Map(),
    };
    pending = attempt;
    setStatus("connecting");
    startListening();
    sendInitialize(attempt.requestId);
    attempt.retryTimer = setInterval(() => {
      sendInitialize(attempt.requestId);
    }, retryIntervalMs);
    attempt.deadlineTimer = setTimeout(() => {
      failAttempt(
        new ArtifactRuntimeError(
          "TIMEOUT",
          `Host did not answer ${METHOD_INITIALIZE} within ${String(timeoutMs)} ms`,
        ),
      );
    }, timeoutMs);
    return promise;
  }

  function subscribe(listener: ContextListener): () => void {
    if (status === "disposed") return () => undefined;
    listeners.add(listener);
    if (context) safeCall(listener, context);
    return () => {
      listeners.delete(listener);
    };
  }

  function dispose(): void {
    if (status === "disposed") return;
    setStatus("disposed");
    const attempt = pending;
    pending = undefined;
    session = undefined;
    context = undefined;
    listeners.clear();
    statusListeners.clear();
    stopListening();
    if (attempt) {
      clearAttemptTimers(attempt);
      attempt.reject(
        new ArtifactRuntimeError("DISPOSED", "Client was disposed during initialization"),
      );
    }
  }

  return {
    connect,
    context: {
      get: () => context,
      subscribe,
    },
    get status() {
      return status;
    },
    subscribeStatus(listener) {
      if (status === "disposed") return () => undefined;
      statusListeners.add(listener);
      return () => {
        statusListeners.delete(listener);
      };
    },
    dispose,
  };
}
