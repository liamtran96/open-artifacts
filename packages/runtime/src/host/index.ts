/**
 * @open-artifacts/runtime/host
 *
 * Trusted host bridge for the embedding product. Never load this inside an
 * artifact iframe. Contract: docs/contracts/runtime-sdk.md.
 */

export { createArtifactHostBridge } from "../host.js";
export type {
  ArtifactHostBridge,
  ArtifactHostBridgeOptions,
  ContextUpdate,
  HostFrame,
} from "../host.js";

export {
  ArtifactRuntimeError,
  PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  MAX_MESSAGE_BYTES,
} from "../protocol.js";
export type {
  ArtifactContext,
  ArtifactKind,
  ArtifactRuntimeErrorCode,
  ArtifactTheme,
  Capability,
  ProtocolVersion,
} from "../protocol.js";
