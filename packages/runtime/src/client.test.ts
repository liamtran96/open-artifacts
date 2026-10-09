import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createArtifactClient } from "./client.js";
import type { ArtifactContext } from "./protocol.js";
import { ArtifactRuntimeError, MAX_MESSAGE_BYTES } from "./protocol.js";
import { FakeWindow, createWindowPair, flush } from "./testing/fake-windows.js";

const context: ArtifactContext = {
  artifactId: "art_1",
  viewedRevision: 3,
  kind: "html",
  theme: "light",
  locale: "en-US",
};

function lastInitialize(host: FakeWindow): { id: string; params: unknown } {
  const last = host.sent.at(-1)?.data as
    { id: string; method: string; params: unknown } | undefined;
  if (last?.method !== "oa/initialize") throw new Error("no initialize request sent");
  return { id: last.id, params: last.params };
}

function okResult(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      protocolVersion: 1,
      capabilities: ["context.read", "context.subscribe"],
      context,
      sessionId: "sess_1",
      sequence: 3,
      ...overrides,
    },
  };
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toSatisfy(
    (e: unknown) => e instanceof ArtifactRuntimeError && e.code === code,
  );
}

describe("createArtifactClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects option values that are not positive finite durations", () => {
    expect(() => createArtifactClient({ timeoutMs: 0 })).toThrow(RangeError);
    expect(() => createArtifactClient({ retryIntervalMs: Number.NaN })).toThrow(RangeError);
    expect(() => createArtifactClient({ retryIntervalMs: Number.POSITIVE_INFINITY })).toThrow(
      RangeError,
    );
  });

  it("rejects with HOST_UNAVAILABLE when there is no parent window", async () => {
    const top = new FakeWindow();
    top.parent = top;
    await expectCode(createArtifactClient({ window: top }).connect(), "HOST_UNAVAILABLE");
    const orphan = new FakeWindow();
    await expectCode(createArtifactClient({ window: orphan }).connect(), "HOST_UNAVAILABLE");
    expect(top.listeners.size).toBe(0);
  });

  it("retries the same initialize request until the deadline, then times out and stops", async () => {
    const { host, clientWindow, frame } = createWindowPair();
    const client = createArtifactClient({
      window: clientWindow,
      timeoutMs: 1000,
      retryIntervalMs: 250,
    });
    const promise = client.connect();
    expect(client.status).toBe("connecting");
    expect(host.sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(260);
    expect(host.sent).toHaveLength(2);
    const ids = new Set(host.sent.map((m) => (m.data as { id: string }).id));
    expect(ids.size).toBe(1);
    const outcome = expectCode(promise, "TIMEOUT");
    await vi.advanceTimersByTimeAsync(800);
    await outcome;
    expect(client.status).toBe("idle");
    expect(vi.getTimerCount()).toBe(0);
    expect(frame.listeners.size).toBe(0);
    const sentBefore = host.sent.length;
    await vi.advanceTimersByTimeAsync(2000);
    expect(host.sent.length).toBe(sentBefore);
  });

  it("shares one in-flight attempt and installs one listener across repeated connect calls", async () => {
    const { host, clientWindow, frame } = createWindowPair();
    const client = createArtifactClient({ window: clientWindow });
    const a = client.connect();
    const b = client.connect();
    expect(b).toBe(a);
    expect(frame.listeners.size).toBe(1);
    expect(host.sent).toHaveLength(1);
    frame.deliver(okResult(lastInitialize(host).id), host);
    const connection = await a;
    expect(client.status).toBe("connected");
    expect(connection.context).toEqual(context);
    expect(connection.capabilities).toEqual(["context.read", "context.subscribe"]);
    await expect(client.connect()).resolves.toBe(connection);
    expect(frame.listeners.size).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects with PROTOCOL_MISMATCH on a mismatch error and on an unsupported negotiated version", async () => {
    const { host, clientWindow, frame } = createWindowPair();
    const client = createArtifactClient({ window: clientWindow });
    const first = client.connect();
    frame.deliver(
      {
        jsonrpc: "2.0",
        id: lastInitialize(host).id,
        error: { code: -32000, message: "nope", data: { code: "PROTOCOL_MISMATCH" } },
      },
      host,
    );
    await expectCode(first, "PROTOCOL_MISMATCH");

    const second = client.connect();
    frame.deliver(okResult(lastInitialize(host).id, { protocolVersion: 2 }), host);
    await expectCode(second, "PROTOCOL_MISMATCH");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("maps JSON-RPC method-not-found to PROTOCOL_MISMATCH and other host errors to INVALID_MESSAGE", async () => {
    const { host, clientWindow, frame } = createWindowPair();
    const client = createArtifactClient({ window: clientWindow });
    const first = client.connect();
    frame.deliver(
      {
        jsonrpc: "2.0",
        id: lastInitialize(host).id,
        error: { code: -32601, message: "Method not found" },
      },
      host,
    );
    await expectCode(first, "PROTOCOL_MISMATCH");
    const second = client.connect();
    frame.deliver(
      {
        jsonrpc: "2.0",
        id: lastInitialize(host).id,
        error: { code: -32600, message: "Invalid Request" },
      },
      host,
    );
    await expectCode(second, "INVALID_MESSAGE");
  });

  it("rejects a malformed matching result with INVALID_MESSAGE and allows an explicit retry", async () => {
    const { host, clientWindow, frame } = createWindowPair();
    const client = createArtifactClient({ window: clientWindow });
    const first = client.connect();
    frame.deliver(
      { jsonrpc: "2.0", id: lastInitialize(host).id, result: { protocolVersion: 1 } },
      host,
    );
    await expectCode(first, "INVALID_MESSAGE");
    expect(client.status).toBe("idle");

    const second = client.connect();
    frame.deliver(okResult(lastInitialize(host).id), host);
    await expect(second).resolves.toBeDefined();
    expect(client.status).toBe("connected");
  });

  it("ignores responses from the wrong window, for other request ids, and malformed envelopes", async () => {
    const { host, clientWindow, frame } = createWindowPair();
    const client = createArtifactClient({ window: clientWindow, timeoutMs: 1000 });
    const promise = client.connect();
    const { id } = lastInitialize(host);
    const stranger = new FakeWindow("https://evil.example");
    frame.deliver(okResult(id), stranger);
    frame.deliver(okResult("someone-else"), host);
    frame.deliver("not an object", host);
    frame.deliver({ jsonrpc: "1.0", id, result: {} }, host);
    frame.deliver(null, host);
    expect(client.status).toBe("connecting");
    frame.deliver(okResult(id), host);
    await expect(promise).resolves.toBeDefined();
  });

  it("delivers snapshots to subscribers registered before and after connecting", async () => {
    const { host, clientWindow, frame } = createWindowPair();
    const client = createArtifactClient({ window: clientWindow });
    const early = vi.fn();
    client.context.subscribe(early);
    expect(early).not.toHaveBeenCalled();
    expect(client.context.get()).toBeUndefined();

    const promise = client.connect();
    frame.deliver(okResult(lastInitialize(host).id), host);
    await promise;
    expect(early).toHaveBeenCalledTimes(1);
    expect(early).toHaveBeenLastCalledWith(context);

    const late = vi.fn();
    const unsubscribe = client.context.subscribe(late);
    expect(late).toHaveBeenCalledTimes(1);
    expect(Object.isFrozen(client.context.get())).toBe(true);

    unsubscribe();
    unsubscribe();
    frame.deliver(
      {
        jsonrpc: "2.0",
        method: "oa/context-changed",
        params: { sessionId: "sess_1", sequence: 4, context: { ...context, theme: "dark" } },
      },
      host,
    );
    expect(late).toHaveBeenCalledTimes(1);
    expect(early).toHaveBeenCalledTimes(2);
    expect(client.context.get()?.theme).toBe("dark");
  });

  it("isolates a throwing listener from the others", async () => {
    const { host, clientWindow, frame } = createWindowPair();
    const errors: unknown[] = [];
    const client = createArtifactClient({
      window: clientWindow,
      onListenerError: (e) => errors.push(e),
    });
    client.context.subscribe(() => {
      throw new Error("boom");
    });
    const good = vi.fn();
    client.context.subscribe(good);
    const promise = client.connect();
    frame.deliver(okResult(lastInitialize(host).id), host);
    await promise;
    expect(good).toHaveBeenCalledTimes(1);
    expect(errors).toHaveLength(1);
  });

  it("applies only the newest queued context notification that is newer than the initialize snapshot", async () => {
    const { host, clientWindow, frame } = createWindowPair();
    const client = createArtifactClient({ window: clientWindow });
    const seen: string[] = [];
    client.context.subscribe((c) => seen.push(`${c.theme}:${c.locale}`));
    const promise = client.connect();
    const { id } = lastInitialize(host);
    const notify = (
      sequence: number,
      patch: Partial<ArtifactContext>,
      sessionId = "sess_1",
    ): void => {
      frame.deliver(
        {
          jsonrpc: "2.0",
          method: "oa/context-changed",
          params: { sessionId, sequence, context: { ...context, ...patch } },
        },
        host,
      );
    };
    notify(5, { theme: "dark" });
    notify(4, { locale: "fr-FR" });
    notify(9, { locale: "de-DE" }, "other-session");
    frame.deliver(okResult(id, { sequence: 3 }), host);
    await promise;
    expect(seen).toEqual(["dark:en-US"]);
    expect(client.context.get()?.theme).toBe("dark");

    // A stale notification queued during init must not win over a newer init snapshot.
    const client2 = createArtifactClient({ window: clientWindow });
    const seen2: string[] = [];
    client2.context.subscribe((c) => seen2.push(c.theme));
    const promise2 = client2.connect();
    notify(2, { theme: "dark" });
    frame.deliver(okResult(lastInitialize(host).id, { sequence: 3 }), host);
    await promise2;
    expect(seen2).toEqual(["light"]);
    client.dispose();
    client2.dispose();
  });

  it("ignores stale-session, out-of-order, wrong-window, malformed, and oversized notifications once connected", async () => {
    const { host, clientWindow, frame } = createWindowPair();
    const client = createArtifactClient({ window: clientWindow });
    const promise = client.connect();
    frame.deliver(okResult(lastInitialize(host).id, { sequence: 3 }), host);
    await promise;
    const listener = vi.fn();
    client.context.subscribe(listener);
    const params = (sequence: number, sessionId = "sess_1"): unknown => ({
      sessionId,
      sequence,
      context: { ...context, theme: "dark" },
    });
    frame.deliver(
      { jsonrpc: "2.0", method: "oa/context-changed", params: params(4, "stale") },
      host,
    );
    frame.deliver({ jsonrpc: "2.0", method: "oa/context-changed", params: params(3) }, host);
    frame.deliver({ jsonrpc: "2.0", method: "oa/context-changed", params: params(2) }, host);
    frame.deliver(
      { jsonrpc: "2.0", method: "oa/context-changed", params: params(4) },
      new FakeWindow(),
    );
    frame.deliver(
      {
        jsonrpc: "2.0",
        method: "oa/context-changed",
        params: { sessionId: "sess_1", sequence: 4, context: { theme: "dark" } },
      },
      host,
    );
    frame.deliver(
      {
        jsonrpc: "2.0",
        method: "oa/context-changed",
        params: { ...(params(4) as object), padding: "x".repeat(MAX_MESSAGE_BYTES) },
      },
      host,
    );
    expect(listener).toHaveBeenCalledTimes(1);
    expect(client.context.get()?.theme).toBe("light");
    frame.deliver({ jsonrpc: "2.0", method: "oa/context-changed", params: params(4) }, host);
    expect(client.context.get()?.theme).toBe("dark");
  });

  it("disconnects on a matching teardown, clears context, and allows explicit reconnection", async () => {
    const { host, clientWindow, frame } = createWindowPair();
    const client = createArtifactClient({ window: clientWindow });
    const promise = client.connect();
    frame.deliver(okResult(lastInitialize(host).id), host);
    await promise;
    frame.deliver({ jsonrpc: "2.0", method: "oa/teardown", params: { sessionId: "other" } }, host);
    expect(client.status).toBe("connected");
    frame.deliver({ jsonrpc: "2.0", method: "oa/teardown", params: { sessionId: "sess_1" } }, host);
    expect(client.status).toBe("disconnected");
    expect(client.context.get()).toBeUndefined();
    expect(frame.listeners.size).toBe(0);

    const again = client.connect();
    expect(client.status).toBe("connecting");
    frame.deliver(okResult(lastInitialize(host).id, { sessionId: "sess_2", sequence: 1 }), host);
    await expect(again).resolves.toMatchObject({ context });
  });

  it("does not let a late response to an old request restore a connection", async () => {
    const { host, clientWindow, frame } = createWindowPair();
    const client = createArtifactClient({ window: clientWindow, timeoutMs: 500 });
    const first = client.connect();
    const { id: oldId } = lastInitialize(host);
    const outcome = expectCode(first, "TIMEOUT");
    await vi.advanceTimersByTimeAsync(600);
    await outcome;
    frame.deliver(okResult(oldId), host);
    expect(client.status).toBe("idle");
    expect(client.context.get()).toBeUndefined();
  });

  it("dispose rejects a pending connect with DISPOSED, clears timers, and is terminal and idempotent", async () => {
    const { host, clientWindow, frame } = createWindowPair();
    const client = createArtifactClient({ window: clientWindow });
    const listener = vi.fn();
    client.context.subscribe(listener);
    const promise = client.connect();
    const { id } = lastInitialize(host);
    client.dispose();
    client.dispose();
    await expectCode(promise, "DISPOSED");
    expect(client.status).toBe("disposed");
    expect(vi.getTimerCount()).toBe(0);
    expect(frame.listeners.size).toBe(0);
    frame.deliver(okResult(id), host);
    expect(client.context.get()).toBeUndefined();
    expect(listener).not.toHaveBeenCalled();
    await expectCode(client.connect(), "DISPOSED");
    expect(client.context.subscribe(listener)).toBeTypeOf("function");
    await flush();
  });

  it("answers unsolicited host requests with JSON-RPC Method not found", () => {
    const { host, clientWindow, frame } = createWindowPair();
    const client = createArtifactClient({ window: clientWindow });
    void client.connect().catch(() => undefined);
    frame.deliver({ jsonrpc: "2.0", id: 7, method: "oa/anything" }, host);
    const reply = host.sent.at(-1)?.data as { id: number; error: { code: number } };
    expect(reply.id).toBe(7);
    expect(reply.error.code).toBe(-32601);
    client.dispose();
  });

  it("keeps retrying when the parent throws on postMessage and surfaces a TIMEOUT", async () => {
    const { host, clientWindow } = createWindowPair();
    host.closed = true;
    const client = createArtifactClient({
      window: clientWindow,
      timeoutMs: 300,
      retryIntervalMs: 100,
    });
    const promise = client.connect();
    const outcome = expectCode(promise, "TIMEOUT");
    await vi.advanceTimersByTimeAsync(400);
    await outcome;
  });
});
