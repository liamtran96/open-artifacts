/**
 * Wire protocol shared by the artifact client and the host bridge.
 *
 * JSON-RPC 2.0 envelopes over window.postMessage, as specified in
 * docs/contracts/runtime-sdk.md. Everything that crosses the iframe boundary
 * is validated here at runtime before either side acts on it.
 */

export type ArtifactKind = "html" | "document" | "layout" | "app";

export type ArtifactTheme = "light" | "dark";

export type ArtifactContext = Readonly<{
  artifactId: string;
  viewedRevision: number;
  kind: ArtifactKind;
  theme: ArtifactTheme;
  locale: string;
}>;

export type Capability = "context.read" | "context.subscribe";

export type ProtocolVersion = 1;

export type Connection = Readonly<{
  protocolVersion: ProtocolVersion;
  capabilities: readonly Capability[];
  context: ArtifactContext;
}>;

export type ArtifactRuntimeErrorCode =
  | "TIMEOUT"
  | "PROTOCOL_MISMATCH"
  | "INVALID_MESSAGE"
  | "DISCONNECTED"
  | "DISPOSED"
  | "HOST_UNAVAILABLE";

/** Error raised by the client and carried in JSON-RPC error data by the host. */
export class ArtifactRuntimeError extends Error {
  readonly code: ArtifactRuntimeErrorCode;

  constructor(code: ArtifactRuntimeErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ArtifactRuntimeError";
    this.code = code;
  }
}

export const PROTOCOL_VERSION: ProtocolVersion = 1;
export const SUPPORTED_PROTOCOL_VERSIONS: readonly ProtocolVersion[] = [PROTOCOL_VERSION];

export const METHOD_INITIALIZE = "oa/initialize";
export const METHOD_CONTEXT_CHANGED = "oa/context-changed";
export const METHOD_TEARDOWN = "oa/teardown";

/** Control messages larger than this are ignored on both sides. */
export const MAX_MESSAGE_BYTES = 16 * 1024;

export const DEFAULT_CONNECT_TIMEOUT_MS = 5_000;
export const DEFAULT_RETRY_INTERVAL_MS = 250;

export const ALL_CAPABILITIES: readonly Capability[] = ["context.read", "context.subscribe"];

const ARTIFACT_KINDS: ReadonlySet<string> = new Set<ArtifactKind>([
  "html",
  "document",
  "layout",
  "app",
]);
const THEMES: ReadonlySet<string> = new Set<ArtifactTheme>(["light", "dark"]);
const CAPABILITIES: ReadonlySet<string> = new Set<Capability>(ALL_CAPABILITIES);
const ERROR_CODES: ReadonlySet<string> = new Set<ArtifactRuntimeErrorCode>([
  "TIMEOUT",
  "PROTOCOL_MISMATCH",
  "INVALID_MESSAGE",
  "DISCONNECTED",
  "DISPOSED",
  "HOST_UNAVAILABLE",
]);

/** Upper bound for identifier strings so a hostile peer cannot inflate state. */
const MAX_ID_LENGTH = 256;

// JSON-RPC 2.0 reserved codes plus one implementation-defined code.
export const JSON_RPC_INVALID_REQUEST = -32600;
export const JSON_RPC_METHOD_NOT_FOUND = -32601;
export const JSON_RPC_INVALID_PARAMS = -32602;
export const JSON_RPC_PROTOCOL_MISMATCH = -32000;

export type JsonRpcId = string | number;

export interface JsonRpcError {
  code: number;
  message: string;
  /** Free-form; an SDK error code, when present, lives in `data.code`. */
  data?: Record<string, unknown>;
}

export interface InitializeParams {
  protocolVersions: readonly number[];
  /** Identifies the document instance in the frame; a new document starts a new session. */
  documentId: string;
}

export interface InitializeResult {
  /** Any positive integer the host selected; the client checks support separately. */
  protocolVersion: number;
  capabilities: readonly Capability[];
  context: ArtifactContext;
  sessionId: string;
  sequence: number;
}

export interface ContextChangedParams {
  sessionId: string;
  sequence: number;
  context: ArtifactContext;
}

export interface TeardownParams {
  sessionId: string;
}

export type ParsedMessage =
  | { type: "request"; id: JsonRpcId; method: string; params: unknown }
  | { type: "notification"; method: string; params: unknown }
  | { type: "response"; id: JsonRpcId; result: unknown }
  | { type: "error"; id: JsonRpcId | null; error: JsonRpcError }
  /** A JSON-RPC-shaped object that is not a usable envelope; `id` is set when one was recoverable. */
  | { type: "invalid"; id: JsonRpcId | undefined };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown, maxLength = MAX_ID_LENGTH): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isJsonRpcId(value: unknown): value is JsonRpcId {
  return isNonEmptyString(value) || (typeof value === "number" && Number.isFinite(value));
}

const encoder = new TextEncoder();

/**
 * True when the structured-clone payload serializes within the control-message limit.
 * Callers run this once per inbound message, before parseMessage.
 */
export function isWithinSizeLimit(data: unknown): boolean {
  let serialized: string;
  try {
    serialized = JSON.stringify(data);
  } catch {
    return false;
  }
  if (typeof serialized !== "string") return false;
  // UTF-8 is between 1 and 3 bytes per UTF-16 code unit, so most payloads are decided
  // without encoding; only the band in between needs the exact byte count.
  if (serialized.length > MAX_MESSAGE_BYTES) return false;
  if (serialized.length * 3 <= MAX_MESSAGE_BYTES) return true;
  return encoder.encode(serialized).byteLength <= MAX_MESSAGE_BYTES;
}

/**
 * Classify an incoming payload as a JSON-RPC request, notification, response, or error.
 * Returns undefined for payloads that are not objects at all, and `invalid` (with the
 * request id when one is recoverable) for objects that are not a well-formed envelope.
 */
export function parseMessage(data: unknown): ParsedMessage | undefined {
  if (!isRecord(data)) return undefined;
  const hasId = "id" in data;
  const id = data.id;
  const invalid: ParsedMessage = { type: "invalid", id: isJsonRpcId(id) ? id : undefined };
  if (data.jsonrpc !== "2.0") return invalid;

  if ("method" in data) {
    const method = data.method;
    if (!isNonEmptyString(method)) return invalid;
    const params = data.params;
    if (params !== undefined && !isRecord(params)) return invalid;
    if (hasId) {
      if (!isJsonRpcId(id)) return invalid;
      return { type: "request", id, method, params };
    }
    return { type: "notification", method, params };
  }

  if ("error" in data) {
    if (!hasId || !(id === null || isJsonRpcId(id))) return invalid;
    const error = data.error;
    if (!isRecord(error)) return invalid;
    const { code, message, data: errorData } = error;
    if (typeof code !== "number" || !Number.isInteger(code) || typeof message !== "string") {
      return invalid;
    }
    return {
      type: "error",
      id,
      error: isRecord(errorData) ? { code, message, data: errorData } : { code, message },
    };
  }

  if ("result" in data) {
    if (!hasId || !isJsonRpcId(id)) return invalid;
    return { type: "response", id, result: data.result };
  }

  return invalid;
}

/** The SDK error code a host attached to a JSON-RPC error, if any. */
export function sdkErrorCodeOf(error: JsonRpcError): ArtifactRuntimeErrorCode | undefined {
  const code = error.data?.code;
  return typeof code === "string" && ERROR_CODES.has(code)
    ? (code as ArtifactRuntimeErrorCode)
    : undefined;
}

/** The JSON-RPC errors the host sends; each carries its SDK code in `data` where one applies. */
export const jsonRpcErrors = {
  invalidRequest: (): JsonRpcError => ({
    code: JSON_RPC_INVALID_REQUEST,
    message: "Invalid Request",
    data: { code: "INVALID_MESSAGE" },
  }),
  invalidParams: (): JsonRpcError => ({
    code: JSON_RPC_INVALID_PARAMS,
    message: "Invalid params",
    data: { code: "INVALID_MESSAGE" },
  }),
  methodNotFound: (): JsonRpcError => ({
    code: JSON_RPC_METHOD_NOT_FOUND,
    message: "Method not found",
  }),
  protocolMismatch: (): JsonRpcError => ({
    code: JSON_RPC_PROTOCOL_MISMATCH,
    message: "Unsupported protocol version",
    data: {
      code: "PROTOCOL_MISMATCH",
      supportedProtocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
    },
  }),
} as const;

/** Validate a full context object and return an immutable copy holding only known fields. */
export function parseContext(value: unknown): ArtifactContext | undefined {
  if (!isRecord(value)) return undefined;
  const { artifactId, viewedRevision, kind, theme, locale } = value;
  if (!isNonEmptyString(artifactId)) return undefined;
  if (!isNonNegativeInteger(viewedRevision)) return undefined;
  if (typeof kind !== "string" || !ARTIFACT_KINDS.has(kind)) return undefined;
  if (typeof theme !== "string" || !THEMES.has(theme)) return undefined;
  if (!isNonEmptyString(locale, 64)) return undefined;
  return Object.freeze({
    artifactId,
    viewedRevision,
    kind: kind as ArtifactKind,
    theme: theme as ArtifactTheme,
    locale,
  });
}

export function isCapability(value: unknown): value is Capability {
  return typeof value === "string" && CAPABILITIES.has(value);
}

export function isProtocolVersion(value: unknown): value is ProtocolVersion {
  return (
    typeof value === "number" && SUPPORTED_PROTOCOL_VERSIONS.includes(value as ProtocolVersion)
  );
}

export function parseInitializeParams(value: unknown): InitializeParams | undefined {
  if (!isRecord(value)) return undefined;
  const versions = value.protocolVersions;
  if (!Array.isArray(versions) || versions.length === 0 || versions.length > 16) return undefined;
  if (!versions.every((v) => typeof v === "number" && Number.isInteger(v) && v > 0))
    return undefined;
  const documentId = value.documentId;
  if (!isNonEmptyString(documentId)) return undefined;
  return { protocolVersions: versions as number[], documentId };
}

export function parseInitializeResult(value: unknown): InitializeResult | undefined {
  if (!isRecord(value)) return undefined;
  const { protocolVersion, capabilities, sessionId, sequence } = value;
  if (
    typeof protocolVersion !== "number" ||
    !Number.isInteger(protocolVersion) ||
    protocolVersion <= 0
  ) {
    return undefined;
  }
  if (!Array.isArray(capabilities) || capabilities.length > 64) return undefined;
  if (!isNonEmptyString(sessionId)) return undefined;
  if (!isNonNegativeInteger(sequence)) return undefined;
  const context = parseContext(value.context);
  if (!context) return undefined;
  // Unknown capabilities are dropped rather than rejected so a newer host stays usable.
  const known = Object.freeze([...new Set(capabilities.filter(isCapability))]);
  return { protocolVersion, capabilities: known, context, sessionId, sequence };
}

export function parseContextChangedParams(value: unknown): ContextChangedParams | undefined {
  if (!isRecord(value)) return undefined;
  const { sessionId, sequence } = value;
  if (!isNonEmptyString(sessionId)) return undefined;
  if (!isNonNegativeInteger(sequence)) return undefined;
  const context = parseContext(value.context);
  if (!context) return undefined;
  return { sessionId, sequence, context };
}

export function parseTeardownParams(value: unknown): TeardownParams | undefined {
  if (!isRecord(value)) return undefined;
  const sessionId = value.sessionId;
  if (!isNonEmptyString(sessionId)) return undefined;
  return { sessionId };
}

/**
 * Random identifier for requests and sessions. Not a secret; it only binds lifecycle traffic.
 * randomUUID is unavailable in insecure browsing contexts, where getRandomValues still works.
 */
export function createId(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = c.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

interface DocumentIdHolder {
  __openArtifactsDocumentId?: string;
}

/**
 * One identifier per document instance, shared by every client created in that
 * document (including an IIFE and an ESM copy side by side). Stored on the
 * window object because a navigation replaces it, while a late load event or a
 * second client does not.
 */
export function documentIdFor(target: object): string {
  const holder = target as DocumentIdHolder;
  holder.__openArtifactsDocumentId ??= createId();
  return holder.__openArtifactsDocumentId;
}

/** Validate a user-supplied positive, finite duration in milliseconds. */
export function assertPositiveFinite(name: string, value: number): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number of milliseconds`);
  }
}

/** The subset of a Window a sender needs. Also satisfied by test doubles. */
export interface MessageTarget {
  postMessage(message: unknown, targetOrigin: string): void;
}

/** The subset of a Window a receiver needs. Also satisfied by test doubles. */
export interface MessageListenerTarget {
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent) => void): void;
}

/** The window an artifact client runs in. A real Window satisfies this; tests pass doubles. */
export interface ClientWindow extends MessageListenerTarget {
  parent: MessageTarget | null;
}

/** The browser window when running in one; undefined elsewhere. */
export function defaultWindow(): ClientWindow | undefined {
  return typeof window === "object" ? window : undefined;
}
