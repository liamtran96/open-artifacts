/**
 * Plain JavaScript host: owns the artifact identity, creates a sandboxed
 * iframe, binds the host bridge before the frame loads, and pushes theme
 * changes. Destroy/recreate shows that the bridge and frame are disposable.
 */

import {
  createArtifactHostBridge,
  type ArtifactContext,
  type ArtifactHostBridge,
  type ArtifactTheme,
} from "@open-artifacts/runtime/host";

const context: ArtifactContext = {
  artifactId: "art_plain_01",
  viewedRevision: 4,
  kind: "html",
  theme: "light",
  locale: "en-US",
};

let theme: ArtifactTheme = context.theme;
let bridge: ArtifactHostBridge | undefined;
let iframe: HTMLIFrameElement | undefined;

const byId = (id: string): HTMLElement => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`missing #${id}`);
  return element;
};

const slot = byId("preview-slot");
const destroyButton = byId("destroy") as HTMLButtonElement;
const recreateButton = byId("recreate") as HTMLButtonElement;

function renderHostState(): void {
  document.documentElement.dataset.theme = theme;
  byId("artifact-id").textContent = context.artifactId;
  byId("revision").textContent = String(context.viewedRevision);
  byId("theme").textContent = theme;
  byId("session").textContent = bridge?.sessionId ?? "(no preview)";
}

function createPreview(): void {
  if (iframe) return;
  iframe = document.createElement("iframe");
  iframe.id = "preview";
  iframe.title = "Artifact preview";
  // No allow-same-origin: the artifact runs with an opaque origin.
  iframe.sandbox.add("allow-scripts");
  // Bind the listener before navigation so no initialize request is missed.
  bridge = createArtifactHostBridge({ iframe, context: { ...context, theme } });
  iframe.src = "/artifact.html";
  slot.append(iframe);
  destroyButton.disabled = false;
  recreateButton.disabled = true;
  renderHostState();
}

function destroyPreview(): void {
  bridge?.dispose();
  bridge = undefined;
  iframe?.remove();
  iframe = undefined;
  destroyButton.disabled = true;
  recreateButton.disabled = false;
  renderHostState();
}

byId("toggle-theme").addEventListener("click", () => {
  theme = theme === "light" ? "dark" : "light";
  bridge?.setContext({ theme });
  renderHostState();
});
destroyButton.addEventListener("click", destroyPreview);
recreateButton.addEventListener("click", createPreview);

createPreview();
