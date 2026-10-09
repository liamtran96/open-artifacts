import { describe, expect, it } from "vitest";

import { createArtifactHostBridge } from "./host.js";
import { MAX_MESSAGE_BYTES } from "./protocol.js";
import { FakeWindow, createWindowPair } from "./testing/fake-windows.js";
import { sampleContext as context } from "./testing/helpers.js";

const initialize = (
  id: string | number = "req_1",
  protocolVersions: unknown = [1],
  documentId: unknown = "doc_1",
): unknown => ({
  jsonrpc: "2.0",
  id,
  method: "oa/initialize",
  params: { protocolVersions, documentId },
});

const last = (window: FakeWindow): Record<string, unknown> => {
  if (window.lastSent === undefined) throw new Error("nothing sent to window");
  return window.lastSent as Record<string, unknown>;
};

describe("createArtifactHostBridge", () => {
  it("validates the host context and capabilities up front", () => {
    const { host, iframe } = createWindowPair();
    expect(() =>
      createArtifactHostBridge({
        iframe,
        window: host,
        context: { ...context, viewedRevision: -1 },
      }),
    ).toThrow(TypeError);
    expect(() =>
      createArtifactHostBridge({
        iframe,
        window: host,
        context: { ...context, kind: "pdf" as "html" },
      }),
    ).toThrow(TypeError);
    expect(() =>
      createArtifactHostBridge({
        iframe,
        window: host,
        context,
        capabilities: ["context.read", "files.write" as "context.read"],
      }),
    ).toThrow(TypeError);
    expect(host.listeners.size).toBe(0);
  });

  it("answers initialize from the bound frame with the negotiated result and ignores other windows", () => {
    const { host, frame, iframe } = createWindowPair();
    const bridge = createArtifactHostBridge({
      iframe,
      window: host,
      context,
      capabilities: ["context.read"],
    });
    host.deliver(initialize(), new FakeWindow());
    expect(frame.sent).toHaveLength(0);

    host.deliver(initialize("req_1", [3, 1, 2]), frame);
    const reply = last(frame);
    expect(reply.id).toBe("req_1");
    expect(reply.result).toEqual({
      protocolVersion: 1,
      capabilities: ["context.read"],
      context,
      sessionId: bridge.sessionId,
      sequence: 1,
    });
    expect(frame.sent.at(-1)?.targetOrigin).toBe("*");

    host.deliver(initialize("req_1"), frame);
    expect(last(frame).result).toMatchObject({ sessionId: bridge.sessionId, sequence: 1 });
    bridge.dispose();
  });

  it("rejects an initialize whose versions do not include the supported one with PROTOCOL_MISMATCH", () => {
    const { host, frame, iframe } = createWindowPair();
    const bridge = createArtifactHostBridge({ iframe, window: host, context });
    host.deliver(initialize("req_2", [2]), frame);
    expect(last(frame).error).toEqual({
      code: -32000,
      message: "Unsupported protocol version",
      data: { code: "PROTOCOL_MISMATCH", supportedProtocolVersions: [1] },
    });
    bridge.dispose();
  });

  it("returns Method not found, Invalid params, and Invalid Request for bad requests from the frame", () => {
    const { host, frame, iframe } = createWindowPair();
    const bridge = createArtifactHostBridge({ iframe, window: host, context });

    host.deliver({ jsonrpc: "2.0", id: 1, method: "oa/write" }, frame);
    expect(last(frame).error).toMatchObject({ code: -32601 });

    host.deliver(initialize(4, [1], ""), frame);
    expect(last(frame).error).toMatchObject({ code: -32602, data: { code: "INVALID_MESSAGE" } });
    host.deliver(initialize(2, "1"), frame);
    expect(last(frame).error).toMatchObject({ code: -32602, data: { code: "INVALID_MESSAGE" } });

    host.deliver({ jsonrpc: "2.0", id: 3 }, frame);
    expect(last(frame).error).toMatchObject({ code: -32600, data: { code: "INVALID_MESSAGE" } });
    expect(last(frame).id).toBe(3);

    const count = frame.sent.length;
    host.deliver({ jsonrpc: "2.0", method: "oa/context-changed", params: {} }, frame);
    host.deliver("garbage", frame);
    host.deliver({ jsonrpc: "2.0" }, frame);
    host.deliver(
      {
        jsonrpc: "2.0",
        id: "big",
        method: "oa/initialize",
        params: { protocolVersions: [1], pad: "x".repeat(MAX_MESSAGE_BYTES) },
      },
      frame,
    );
    expect(frame.sent).toHaveLength(count);
    bridge.dispose();
  });

  it("publishes changed theme or locale with an increasing sequence and skips no-op updates", () => {
    const { host, frame, iframe } = createWindowPair();
    const bridge = createArtifactHostBridge({ iframe, window: host, context });
    bridge.setContext({ theme: "light" });
    expect(frame.sent).toHaveLength(0);

    bridge.setContext({ theme: "dark" });
    expect(last(frame)).toEqual({
      jsonrpc: "2.0",
      method: "oa/context-changed",
      params: { sessionId: bridge.sessionId, sequence: 2, context: { ...context, theme: "dark" } },
    });
    bridge.setContext({ locale: "fr-FR" });
    expect(last(frame).params).toMatchObject({
      sequence: 3,
      context: { theme: "dark", locale: "fr-FR" },
    });
    expect(bridge.getContext()).toEqual({ ...context, theme: "dark", locale: "fr-FR" });

    expect(() => {
      bridge.setContext({ theme: "sepia" as "dark" });
    }).toThrow(TypeError);
    expect(() => {
      bridge.setContext({ locale: "" });
    }).toThrow(TypeError);
    expect(bridge.getContext().theme).toBe("dark");

    host.deliver(initialize(), frame);
    expect(last(frame).result).toMatchObject({
      sequence: 3,
      context: { theme: "dark", locale: "fr-FR" },
    });
    bridge.dispose();
  });

  it("keeps one session per document and starts a new one when a different document initializes", () => {
    const { host, frame, iframe } = createWindowPair();
    const bridge = createArtifactHostBridge({ iframe, window: host, context });
    host.deliver(initialize("a", [1], "doc_1"), frame);
    const first = bridge.sessionId;
    // A second client in the same document, even after the frame's load event, shares the session.
    host.deliver(initialize("b", [1], "doc_1"), frame);
    expect(bridge.sessionId).toBe(first);
    expect((last(frame).result as { sessionId: string }).sessionId).toBe(first);

    const next = new FakeWindow();
    iframe.navigate(next);
    // The old window is no longer the bound frame.
    host.deliver(initialize("c", [1], "doc_2"), frame);
    expect(frame.sent).toHaveLength(2);
    host.deliver(initialize("c", [1], "doc_2"), next);
    expect(bridge.sessionId).not.toBe(first);
    expect((last(next).result as { sessionId: string }).sessionId).toBe(bridge.sessionId);
    bridge.dispose();
  });

  it("dispose sends teardown once, stops answering, and makes setContext throw", () => {
    const { host, frame, iframe } = createWindowPair();
    const bridge = createArtifactHostBridge({ iframe, window: host, context });
    bridge.dispose();
    bridge.dispose();
    expect(frame.sent).toHaveLength(1);
    expect(last(frame)).toEqual({
      jsonrpc: "2.0",
      method: "oa/teardown",
      params: { sessionId: bridge.sessionId },
    });
    expect(host.listeners.size).toBe(0);
    host.deliver(initialize(), frame);
    expect(frame.sent).toHaveLength(1);
    expect(() => {
      bridge.setContext({ theme: "dark" });
    }).toThrow(/disposed/);
  });

  it("tolerates a frame without a content window and a frame that throws on send", () => {
    const { host, iframe } = createWindowPair();
    iframe.contentWindow = null;
    const bridge = createArtifactHostBridge({ iframe, window: host, context });
    expect(() => {
      bridge.setContext({ theme: "dark" });
    }).not.toThrow();
    const closed = new FakeWindow();
    closed.closed = true;
    iframe.navigate(closed);
    expect(() => {
      bridge.setContext({ theme: "light" });
    }).not.toThrow();
    expect(() => {
      bridge.dispose();
    }).not.toThrow();
  });
});
