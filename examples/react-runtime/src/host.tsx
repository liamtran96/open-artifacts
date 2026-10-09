/**
 * React host: the same host bridge API as the plain example, driven from a
 * component. The bridge is created in the iframe's ref callback so it is bound
 * before navigation, and disposed when the iframe unmounts.
 */

import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  createArtifactHostBridge,
  type ArtifactContext,
  type ArtifactHostBridge,
  type ArtifactTheme,
} from "@open-artifacts/runtime/host";

const context: ArtifactContext = {
  artifactId: "art_react_01",
  viewedRevision: 9,
  kind: "html",
  theme: "light",
  locale: "en-US",
};

function Host() {
  const [theme, setTheme] = useState<ArtifactTheme>(context.theme);
  const [mounted, setMounted] = useState(true);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const bridgeRef = useRef<ArtifactHostBridge | undefined>(undefined);
  const themeRef = useRef(theme);
  themeRef.current = theme;

  const frameRef = useCallback((iframe: HTMLIFrameElement | null) => {
    bridgeRef.current?.dispose();
    bridgeRef.current = undefined;
    if (iframe) {
      bridgeRef.current = createArtifactHostBridge({
        iframe,
        context: { ...context, theme: themeRef.current },
      });
      setSessionId(bridgeRef.current.sessionId);
    } else {
      setSessionId(undefined);
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    bridgeRef.current?.setContext({ theme });
  }, [theme]);

  return (
    <>
      <header>
        <h1 style={{ fontSize: 18, margin: 0 }}>Host (React)</h1>
        <button
          id="toggle-theme"
          type="button"
          onClick={() => {
            setTheme((t) => (t === "light" ? "dark" : "light"));
          }}
        >
          Toggle theme
        </button>
        <button
          id="destroy"
          type="button"
          disabled={!mounted}
          onClick={() => {
            setMounted(false);
          }}
        >
          Destroy preview
        </button>
        <button
          id="recreate"
          type="button"
          disabled={mounted}
          onClick={() => {
            setMounted(true);
          }}
        >
          Recreate preview
        </button>
      </header>
      <dl>
        <dt>Artifact</dt>
        <dd id="artifact-id">{context.artifactId}</dd>
        <dt>Revision</dt>
        <dd id="revision">{context.viewedRevision}</dd>
        <dt>Theme</dt>
        <dd id="theme">{theme}</dd>
        <dt>Session</dt>
        <dd id="session">{sessionId ?? "(no preview)"}</dd>
      </dl>
      <p style={{ margin: "12px 0 4px" }}>Preview (sandboxed iframe, opaque origin):</p>
      <div id="preview-slot">
        {mounted ? (
          <iframe
            id="preview"
            ref={frameRef}
            title="Artifact preview"
            sandbox="allow-scripts"
            src="/artifact.html"
          />
        ) : null}
      </div>
    </>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("missing #root");
createRoot(rootElement).render(
  <StrictMode>
    <Host />
  </StrictMode>,
);
