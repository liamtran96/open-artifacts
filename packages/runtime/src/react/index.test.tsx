import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createArtifactHostBridge } from "../host.js";
import type { ArtifactContext } from "../protocol.js";
import { createWindowPair, flush, type WindowPair } from "../testing/fake-windows.js";
import { ArtifactProvider, useArtifact, useArtifactClient, useArtifactContext } from "./index.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const hostContext: ArtifactContext = {
  artifactId: "art_react",
  viewedRevision: 2,
  kind: "html",
  theme: "light",
  locale: "en-US",
};

function Probe({ pair }: { pair: WindowPair }) {
  const { status, context, connection, error } = useArtifactClient({
    window: pair.clientWindow,
    timeoutMs: 50,
  });
  return (
    <output>
      {status}|{context?.theme ?? "-"}|{connection?.protocolVersion ?? "-"}|{error?.code ?? "-"}
    </output>
  );
}

function Child() {
  const context = useArtifactContext();
  const { status } = useArtifact();
  return (
    <output>
      {status}|{context?.artifactId ?? "-"}
    </output>
  );
}

async function settle(): Promise<void> {
  await act(async () => {
    await flush();
  });
}

describe("@open-artifacts/runtime/react", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await flush();
    });
    container.remove();
  });

  it("connects on mount, mirrors theme changes, and disposes on unmount", async () => {
    const pair = createWindowPair();
    const bridge = createArtifactHostBridge({
      iframe: pair.iframe,
      window: pair.host,
      context: hostContext,
    });
    await act(async () => {
      root.render(<Probe pair={pair} />);
      await flush();
    });
    expect(container.textContent).toBe("connected|light|1|-");

    await act(async () => {
      bridge.setContext({ theme: "dark" });
      await flush();
    });
    expect(container.textContent).toBe("connected|dark|1|-");
    expect(pair.frame.listeners.size).toBe(1);

    await act(async () => {
      root.unmount();
      await flush();
    });
    expect(pair.frame.listeners.size).toBe(0);
    bridge.dispose();
  });

  it("creates a fresh client per Strict Mode remount without leaking the first one", async () => {
    const pair = createWindowPair();
    const bridge = createArtifactHostBridge({
      iframe: pair.iframe,
      window: pair.host,
      context: hostContext,
    });
    await act(async () => {
      root.render(
        <StrictMode>
          <Probe pair={pair} />
        </StrictMode>,
      );
      await flush();
    });
    await settle();
    expect(container.textContent).toBe("connected|light|1|-");
    expect(pair.frame.listeners.size).toBe(1);
    bridge.dispose();
  });

  it("reports host teardown as disconnected and clears the snapshot", async () => {
    const pair = createWindowPair();
    const bridge = createArtifactHostBridge({
      iframe: pair.iframe,
      window: pair.host,
      context: hostContext,
    });
    await act(async () => {
      root.render(<Probe pair={pair} />);
      await flush();
    });
    await act(async () => {
      bridge.dispose();
      await flush();
    });
    expect(container.textContent).toBe("disconnected|-|-|-");
  });

  it("surfaces a connect failure as a typed error", async () => {
    const pair = createWindowPair();
    // No bridge is bound, so initialize times out after 50 ms.
    act(() => {
      root.render(<Probe pair={pair} />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120));
    });
    expect(container.textContent).toBe("idle|-|-|TIMEOUT");
  });

  it("shares one client through ArtifactProvider and throws outside it", async () => {
    const pair = createWindowPair();
    const bridge = createArtifactHostBridge({
      iframe: pair.iframe,
      window: pair.host,
      context: hostContext,
    });
    await act(async () => {
      root.render(
        <ArtifactProvider options={{ window: pair.clientWindow }}>
          <Child />
          <Child />
        </ArtifactProvider>,
      );
      await flush();
    });
    expect(container.textContent).toBe("connected|art_reactconnected|art_react");
    expect(
      pair.host.sent.filter((m) => (m.data as { method?: string }).method === "oa/initialize"),
    ).toHaveLength(1);
    bridge.dispose();

    const lonely = createRoot(document.createElement("div"));
    const originalError = console.error;
    console.error = () => undefined;
    try {
      expect(() => {
        act(() => {
          lonely.render(<Child />);
        });
      }).toThrow(/ArtifactProvider/);
    } finally {
      console.error = originalError;
      act(() => {
        lonely.unmount();
      });
    }
  });
});
