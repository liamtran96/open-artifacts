/**
 * Client and host bridge talking through the fake window pair, end to end.
 * Covers the acceptance behaviors in docs/contracts/runtime-sdk.md that do
 * not need a real browser.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createArtifactClient } from "./client.js";
import { createArtifactHostBridge } from "./host.js";
import type { ArtifactContext } from "./protocol.js";
import { FakeWindow, createWindowPair, flush } from "./testing/fake-windows.js";
import { sampleContext as context } from "./testing/helpers.js";

describe("runtime client <-> host bridge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("connects when the host binds before the frame loads and receives identity, revision, and theme", async () => {
    const { host, iframe, clientWindow } = createWindowPair();
    const bridge = createArtifactHostBridge({ iframe, window: host, context });
    const client = createArtifactClient({ window: clientWindow });
    const seen: ArtifactContext[] = [];
    client.context.subscribe((c) => seen.push(c));

    const connection = await client.connect();
    expect(connection.protocolVersion).toBe(1);
    expect(connection.context).toEqual(context);
    expect(client.context.get()).toEqual(context);
    expect(seen).toEqual([context]);

    bridge.setContext({ theme: "dark" });
    await flush();
    expect(client.context.get()?.theme).toBe("dark");
    expect(seen).toHaveLength(2);

    bridge.dispose();
    await flush();
    expect(client.status).toBe("disconnected");
    expect(client.context.get()).toBeUndefined();
    client.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("connects when the client starts before the host binds, via retry", async () => {
    const { host, iframe, clientWindow } = createWindowPair();
    const client = createArtifactClient({ window: clientWindow, retryIntervalMs: 100 });
    const promise = client.connect();
    await vi.advanceTimersByTimeAsync(350);
    expect(client.status).toBe("connecting");
    const bridge = createArtifactHostBridge({ iframe, window: host, context });
    await vi.advanceTimersByTimeAsync(100);
    await expect(promise).resolves.toMatchObject({ context });
    // Earlier unanswered retries are not answered twice once connected.
    expect(host.sentWithMethod("oa/initialize").length).toBeGreaterThan(1);
    bridge.dispose();
    client.dispose();
  });

  it("applies a theme change made while initialization is pending, in order", async () => {
    const { host, iframe, clientWindow, frame } = createWindowPair();
    const bridge = createArtifactHostBridge({ iframe, window: host, context });
    const client = createArtifactClient({ window: clientWindow });
    const themes: string[] = [];
    client.context.subscribe((c) => themes.push(c.theme));

    const promise = client.connect();
    // The initialize request is queued but not yet delivered; the host changes theme now.
    bridge.setContext({ theme: "dark" });
    await promise;
    expect(themes).toEqual(["dark"]);
    expect(frame.sentWithMethod("oa/context-changed")).toHaveLength(1);
    bridge.dispose();
    client.dispose();
  });

  it("two clients in the same frame share the session and receive the same updates", async () => {
    const { host, iframe, clientWindow } = createWindowPair();
    const bridge = createArtifactHostBridge({ iframe, window: host, context });
    const a = createArtifactClient({ window: clientWindow });
    const b = createArtifactClient({ window: clientWindow });
    const [ca, cb] = await Promise.all([a.connect(), b.connect()]);
    expect(ca.context).toEqual(cb.context);
    bridge.setContext({ locale: "de-DE" });
    await flush();
    expect(a.context.get()?.locale).toBe("de-DE");
    expect(b.context.get()?.locale).toBe("de-DE");
    bridge.dispose();
    a.dispose();
    b.dispose();
  });

  it("a new document in the frame gets a new session and the old document's client stops receiving updates", async () => {
    const { host, iframe, clientWindow } = createWindowPair();
    const bridge = createArtifactHostBridge({ iframe, window: host, context });
    const oldClient = createArtifactClient({ window: clientWindow });
    await oldClient.connect();
    const oldSession = bridge.sessionId;

    const fresh = new FakeWindow();
    iframe.navigate(fresh);
    const newClient = createArtifactClient({ window: fresh });
    await newClient.connect();
    expect(bridge.sessionId).not.toBe(oldSession);

    bridge.setContext({ theme: "dark" });
    await flush();
    expect(newClient.context.get()?.theme).toBe("dark");
    expect(oldClient.context.get()?.theme).toBe("light");
    oldClient.dispose();
    newClient.dispose();
    bridge.dispose();
  });
});
