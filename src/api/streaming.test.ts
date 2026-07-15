import { describe, it, expect, vi, afterEach } from 'vitest';
import { openInspectStream, inspectURL } from './streaming';

// Minimal fake WebSocket: captures listeners and lets a test drive message/error/
// close events synchronously — no real socket, fully deterministic.
class FakeWS {
  static last: FakeWS | undefined;
  listeners: Record<string, Array<(ev: unknown) => void>> = {};
  closed = false;
  constructor(public url: string) {
    FakeWS.last = this;
  }
  addEventListener(type: string, cb: (ev: unknown) => void) {
    (this.listeners[type] ??= []).push(cb);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, ev: unknown) {
    for (const cb of this.listeners[type] ?? []) cb(ev);
  }
}

afterEach(() => vi.unstubAllGlobals());

function withFakeWS() {
  vi.stubGlobal('WebSocket', FakeWS);
}

describe('inspectURL', () => {
  it('rewrites http(s)→ws(s), strips trailing slash, encodes id, per kind', () => {
    expect(inspectURL('http://host:8080/', 'connector', 'a b')).toBe(
      'ws://host:8080/v1/connectors/a%20b/inspect'
    );
    expect(inspectURL('https://host', 'processor-in', 'p1')).toBe(
      'wss://host/v1/processors/p1/inspect-in'
    );
    expect(inspectURL('https://host', 'processor-out', 'p1')).toBe(
      'wss://host/v1/processors/p1/inspect-out'
    );
  });
});

describe('openInspectStream', () => {
  it('delivers the record from a {result} frame', () => {
    withFakeWS();
    const records: unknown[] = [];
    openInspectStream('ws://x', (r) => records.push(r));
    FakeWS.last?.emit('message', { data: JSON.stringify({ result: { id: 'rec1' } }) });
    expect(records).toEqual([{ id: 'rec1' }]);
  });

  it('routes a malformed line to onError and does not throw or deliver a record', () => {
    withFakeWS();
    const onRecord = vi.fn();
    const onError = vi.fn();
    openInspectStream('ws://x', onRecord, { onError });
    // A partial/non-JSON line must not throw out of the handler.
    expect(() => FakeWS.last?.emit('message', { data: '{ not json' })).not.toThrow();
    expect(onRecord).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
  });

  it('routes a grpc-gateway {error} frame to onError, not to onRecord', () => {
    withFakeWS();
    const onRecord = vi.fn();
    const onError = vi.fn();
    openInspectStream('ws://x', onRecord, { onError });
    FakeWS.last?.emit('message', {
      data: JSON.stringify({ error: { code: 13, message: 'boom' } }),
    });
    expect(onRecord).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
  });

  it('fires onClose when the socket closes', () => {
    withFakeWS();
    const onClose = vi.fn();
    openInspectStream('ws://x', vi.fn(), { onClose });
    FakeWS.last?.emit('close', { type: 'close' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('the returned closer closes the socket', () => {
    withFakeWS();
    const close = openInspectStream('ws://x', vi.fn());
    close();
    expect(FakeWS.last?.closed).toBe(true);
  });

  it('keeps delivering records after a malformed line (one bad frame is not fatal)', () => {
    withFakeWS();
    const records: unknown[] = [];
    const onError = vi.fn();
    openInspectStream('ws://x', (r) => records.push(r), { onError });
    FakeWS.last?.emit('message', { data: '{bad' });
    FakeWS.last?.emit('message', { data: JSON.stringify({ result: { id: 'rec2' } }) });
    expect(records).toEqual([{ id: 'rec2' }]);
    expect(onError).toHaveBeenCalledOnce();
  });
});
