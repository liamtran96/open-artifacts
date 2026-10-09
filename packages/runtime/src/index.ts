/**
 * @open-artifacts/runtime
 *
 * Artifact-side context/theme client. This entry runs inside the isolated
 * preview iframe and must stay free of React and editor dependencies. The
 * trusted host bridge lives in the separate `@open-artifacts/runtime/host` entry.
 *
 * Contract: docs/contracts/runtime-sdk.md.
 */

export const packageName = "@open-artifacts/runtime" as const;

export { createArtifactClient } from "./client.js";
export type {
  ArtifactClient,
  ArtifactClientOptions,
  ArtifactClientStatus,
  ClientWindow,
  ContextListener,
} from "./client.js";

export {
  ArtifactRuntimeError,
  PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  DEFAULT_CONNECT_TIMEOUT_MS,
  DEFAULT_RETRY_INTERVAL_MS,
  MAX_MESSAGE_BYTES,
} from "./protocol.js";
export type {
  ArtifactContext,
  ArtifactKind,
  ArtifactRuntimeErrorCode,
  ArtifactTheme,
  Capability,
  Connection,
  ProtocolVersion,
} from "./protocol.js";
