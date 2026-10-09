/**
 * @open-artifacts/runtime/react
 *
 * React hooks over the same artifact client as the base entry. React is an
 * optional peer dependency; the base entry never imports this module.
 * Contract: docs/contracts/runtime-sdk.md.
 */

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import type { ArtifactClient, ArtifactClientOptions, ArtifactClientStatus } from "./client.js";
import { createArtifactClient } from "./client.js";
import type { ArtifactContext, ArtifactRuntimeError, Connection } from "./protocol.js";

export type { ArtifactClient, ArtifactClientOptions, ArtifactClientStatus } from "./client.js";
export type {
  ArtifactContext,
  ArtifactKind,
  ArtifactTheme,
  Capability,
  Connection,
} from "./protocol.js";
export { ArtifactRuntimeError } from "./protocol.js";

export interface ArtifactRuntimeState {
  /** The client owned by the current effect instance; undefined until the effect runs. */
  client: ArtifactClient | undefined;
  status: ArtifactClientStatus;
  /** Latest immutable context snapshot, undefined until connected and after teardown. */
  context: ArtifactContext | undefined;
  connection: Connection | undefined;
  /** The failure of the most recent connect attempt, cleared on the next attempt. */
  error: ArtifactRuntimeError | undefined;
}

const initialState: ArtifactRuntimeState = {
  client: undefined,
  status: "idle",
  context: undefined,
  connection: undefined,
  error: undefined,
};

/**
 * Create one client per mounted effect instance, connect it, and mirror its
 * state. Cleanup disposes the client, so a Strict Mode remount creates a fresh
 * one. Options are read when the effect runs; changing them later has no effect.
 */
export function useArtifactClient(options: ArtifactClientOptions = {}): ArtifactRuntimeState {
  const [state, setState] = useState<ArtifactRuntimeState>(initialState);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const client = createArtifactClient(optionsRef.current);
    let active = true;
    const patch = (partial: Partial<ArtifactRuntimeState>): void => {
      if (active) setState((previous) => ({ ...previous, ...partial }));
    };

    patch({ ...initialState, client, status: client.status });
    const unsubscribeStatus = client.subscribeStatus((status) => {
      // The client owns what each transition invalidates; mirror it rather than re-encode it.
      patch({
        status,
        context: client.context.get(),
        ...(status === "connected" ? {} : { connection: undefined }),
      });
    });
    const unsubscribeContext = client.context.subscribe((context) => {
      patch({ context });
    });
    client.connect().then(
      (connection) => {
        patch({ connection, error: undefined });
      },
      (error: unknown) => {
        // The client only ever rejects with ArtifactRuntimeError.
        patch({ error: error as ArtifactRuntimeError });
      },
    );

    return () => {
      active = false;
      unsubscribeStatus();
      unsubscribeContext();
      client.dispose();
    };
  }, []);

  return state;
}

const ArtifactRuntimeContext = createContext<ArtifactRuntimeState | undefined>(undefined);

export interface ArtifactProviderProps {
  children?: ReactNode;
  options?: ArtifactClientOptions;
}

/** Owns one client for the subtree so several components can share a connection. */
export function ArtifactProvider({ children, options }: ArtifactProviderProps): ReactNode {
  const state = useArtifactClient(options);
  return (
    <ArtifactRuntimeContext.Provider value={state}>{children}</ArtifactRuntimeContext.Provider>
  );
}

/** The runtime state owned by the nearest ArtifactProvider. Throws outside one. */
export function useArtifact(): ArtifactRuntimeState {
  const state = useContext(ArtifactRuntimeContext);
  if (!state) throw new Error("useArtifact must be used within an ArtifactProvider");
  return state;
}

/** Convenience: the current context snapshot from the nearest ArtifactProvider. */
export function useArtifactContext(): ArtifactContext | undefined {
  return useArtifact().context;
}
