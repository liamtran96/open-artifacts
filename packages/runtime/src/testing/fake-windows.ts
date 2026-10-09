/**
 * In-process stand-ins for a host window and an iframe so the client and the
 * bridge can be exercised without a browser. Delivery is asynchronous (a
 * microtask) like real postMessage. Each window knows which window is the
 * source of messages posted to it, which is the only identity the production
 * code compares against.
 */

import type { ClientWindow } from "../client.js";
import type { HostFrame } from "../host.js";
import type { MessageListenerTarget } from "../protocol.js";

type MessageHandler = (event: MessageEvent) => void;

class FakeMessageEvent extends Event {
  constructor(
    readonly data: unknown,
    readonly source: unknown,
  ) {
    super("message");
  }
}

/** Deliveries queued by any FakeWindow and not yet run; `flush` drains them. */
const pendingDeliveries = new Set<Promise<void>>();

export class FakeWindow implements MessageListenerTarget {
  parent: FakeWindow | null = null;
  /** Which window is the `source` of messages posted to this one. */
  sourceOf: () => FakeWindow | null = () => null;
  readonly sent: { data: unknown; targetOrigin: string }[] = [];
  readonly listeners = new Set<MessageHandler>();
  /** Set to true to simulate a navigating/closed window whose postMessage throws. */
  closed = false;

  addEventListener(_type: "message", listener: MessageHandler): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: "message", listener: MessageHandler): void {
    this.listeners.delete(listener);
  }

  /** Called by the sender; `this` is the target window. */
  postMessage(data: unknown, targetOrigin: string): void {
    if (this.closed) throw new Error("window is closed");
    this.sent.push({ data, targetOrigin });
    const source = this.sourceOf();
    const delivery = Promise.resolve().then(() => {
      pendingDeliveries.delete(delivery);
      this.deliver(data, source);
    });
    pendingDeliveries.add(delivery);
  }

  /** Deliver synchronously as if `source` had posted it. */
  deliver(data: unknown, source: unknown): void {
    const event = new FakeMessageEvent(data, source) as unknown as MessageEvent;
    for (const listener of [...this.listeners]) listener(event);
  }

  /** Data of the most recently posted message, or undefined. */
  get lastSent(): unknown {
    return this.sent.at(-1)?.data;
  }

  /** Data of every posted message whose JSON-RPC method matches. */
  sentWithMethod(method: string): unknown[] {
    return this.sent
      .map((m) => m.data)
      .filter((d) => (d as { method?: unknown } | null)?.method === method);
  }
}

export class FakeFrame implements HostFrame {
  constructor(
    private readonly host: FakeWindow,
    public contentWindow: FakeWindow | null,
  ) {}

  /** Simulate a navigation to a new document: `next` becomes the frame's window. */
  navigate(next: FakeWindow): void {
    next.parent = this.host;
    next.sourceOf = () => this.host;
    this.contentWindow = next;
  }
}

export interface WindowPair {
  host: FakeWindow;
  frame: FakeWindow;
  iframe: FakeFrame;
  /** A window the client runs in, whose postMessage calls are attributed to the frame. */
  clientWindow: ClientWindow;
}

/**
 * A host window containing one iframe. The client's `parent.postMessage` lands
 * on the host with `source === iframe.contentWindow`; the bridge's
 * `contentWindow.postMessage` lands on the frame with `source === host`.
 */
export function createWindowPair(): WindowPair {
  const host = new FakeWindow();
  const frame = new FakeWindow();
  const iframe = new FakeFrame(host, frame);
  host.sourceOf = () => iframe.contentWindow;
  iframe.navigate(frame);
  return { host, frame, iframe, clientWindow: frame };
}

/** Wait until every queued delivery, including ones queued by deliveries, has run. */
export async function flush(): Promise<void> {
  while (pendingDeliveries.size > 0) await Promise.all([...pendingDeliveries]);
}
