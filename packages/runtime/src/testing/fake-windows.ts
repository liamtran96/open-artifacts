/**
 * In-process stand-ins for a host window and an iframe so the client and the
 * bridge can be exercised without a browser. Delivery is asynchronous (a
 * microtask) like real postMessage, and `source` is the sending window.
 */

import type { ClientWindow } from "../client.js";
import type { HostFrame } from "../host.js";
import type { MessageListenerTarget } from "../protocol.js";

type MessageHandler = (event: MessageEvent) => void;

export class FakeMessageEvent extends Event {
  readonly data: unknown;
  readonly source: unknown;
  readonly origin: string;

  constructor(data: unknown, source: unknown, origin: string) {
    super("message");
    this.data = data;
    this.source = source;
    this.origin = origin;
  }
}

export class FakeWindow implements MessageListenerTarget {
  parent: FakeWindow | null = null;
  readonly sent: { data: unknown; targetOrigin: string }[] = [];
  readonly listeners = new Set<MessageHandler>();
  /** Set to true to simulate a navigating/closed window whose postMessage throws. */
  closed = false;

  constructor(readonly origin = "null") {}

  addEventListener(_type: "message", listener: MessageHandler): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: "message", listener: MessageHandler): void {
    this.listeners.delete(listener);
  }

  /** Called by the *sender*; `this` is the target window. */
  postMessage(data: unknown, targetOrigin: string): void {
    if (this.closed) throw new Error("window is closed");
    this.sent.push({ data, targetOrigin });
    const source = currentSender;
    void Promise.resolve().then(() => {
      this.deliver(data, source);
    });
  }

  /** Deliver synchronously as if `source` had posted it. */
  deliver(data: unknown, source: unknown): void {
    const event = new FakeMessageEvent(data, source, this.origin) as unknown as MessageEvent;
    for (const listener of [...this.listeners]) listener(event);
  }
}

let currentSender: FakeWindow | null = null;

/** Run `fn` with `sender` recorded as the source of any postMessage it makes. */
export function sendingFrom<T>(sender: FakeWindow, fn: () => T): T {
  const previous = currentSender;
  currentSender = sender;
  try {
    return fn();
  } finally {
    currentSender = previous;
  }
}

export class FakeFrame implements HostFrame {
  contentWindow: FakeWindow | null;
  private readonly loadListeners = new Set<() => void>();

  constructor(contentWindow: FakeWindow | null) {
    this.contentWindow = contentWindow;
  }

  addEventListener(_type: "load", listener: () => void): void {
    this.loadListeners.add(listener);
  }

  removeEventListener(_type: "load", listener: () => void): void {
    this.loadListeners.delete(listener);
  }

  /** Simulate a navigation: optionally swap the content window, then fire load. */
  reload(next?: FakeWindow): void {
    if (next) {
      next.parent = this.contentWindow?.parent ?? null;
      this.contentWindow = next;
    }
    for (const listener of [...this.loadListeners]) listener();
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
 * on the host with `source === frame`; the bridge's `contentWindow.postMessage`
 * lands on the frame with `source === host`.
 */
export function createWindowPair(): WindowPair {
  const host = new FakeWindow("https://host.example");
  const frame = new FakeWindow("null");
  frame.parent = host;
  const iframe = new FakeFrame(frame);

  // The real contentWindow object is what the client compares against, so wrap
  // postMessage on both sides to stamp the sender.
  const hostPost = host.postMessage.bind(host);
  host.postMessage = (data, origin) => {
    sendingFrom(frame, () => {
      hostPost(data, origin);
    });
  };
  const framePost = frame.postMessage.bind(frame);
  frame.postMessage = (data, origin) => {
    sendingFrom(host, () => {
      framePost(data, origin);
    });
  };

  return { host, frame, iframe, clientWindow: frame };
}

/** Flush queued microtask deliveries. */
export async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}
