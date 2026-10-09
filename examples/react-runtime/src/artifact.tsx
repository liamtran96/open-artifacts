/**
 * React artifact: one ArtifactProvider owns the client; components read the
 * negotiated context through hooks. Rendered in Strict Mode on purpose so the
 * double-mount creates and disposes a client without leaking listeners.
 */

import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";

import { ArtifactProvider, useArtifact } from "@open-artifacts/runtime/react";

function View() {
  const { status, context, error } = useArtifact();
  useEffect(() => {
    if (context) document.documentElement.dataset.theme = context.theme;
  }, [context]);
  return (
    <>
      <h1>React artifact</h1>
      <dl>
        <dt>Status</dt>
        <dd id="status">{status}</dd>
        <dt>Artifact</dt>
        <dd id="artifact-id">{context?.artifactId ?? "-"}</dd>
        <dt>Revision</dt>
        <dd id="revision">{context?.viewedRevision ?? "-"}</dd>
        <dt>Theme</dt>
        <dd id="theme">{context?.theme ?? "-"}</dd>
        <dt>Origin</dt>
        <dd id="origin">{window.origin}</dd>
        <dt>Error</dt>
        <dd id="error">{error?.code ?? "-"}</dd>
      </dl>
    </>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("missing #root");
createRoot(rootElement).render(
  <StrictMode>
    <ArtifactProvider>
      <View />
    </ArtifactProvider>
  </StrictMode>,
);
