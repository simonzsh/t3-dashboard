// Minimal WebSocket stand-in: the test drives open, incoming frames and close by hand.
export class FakeSocket {
  static instances: FakeSocket[] = [];
  static reset(): void {
    FakeSocket.instances = [];
  }

  readonly sent: Array<Record<string, unknown>> = [];
  closed = false;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;

  readonly url: string;

  constructor(url: string) {
    this.url = url;
    FakeSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.({});
  }

  open(): void {
    this.onopen?.({});
  }

  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  fail(): void {
    this.onerror?.({});
  }
}

export const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
