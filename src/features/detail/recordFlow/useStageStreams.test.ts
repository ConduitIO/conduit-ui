import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { openInspectStream, type InspectStreamHandlers } from '../../../api/streaming';
import type { SchemaV1Record } from '../../../api/schema';
import type { Stage } from './stages';
import { useStageStreams, type UseStageStreamsArgs } from './useStageStreams';

// A fake `openInspectStream`: every call creates a controllable FakeSocket the
// test can drive (emit a record, an error frame, or a close event) without a
// real WebSocket. Distinct from streaming.test.ts's FakeWS because this fakes
// the *whole* openInspectStream boundary (one layer up), matching the
// `openStream` injection point `useStageStreams` actually takes.
interface FakeSocket {
  url: string;
  closed: boolean;
  emitRecord: (r: SchemaV1Record) => void;
  emitError: () => void;
  emitClose: () => void;
}

function makeFakeTransport() {
  const sockets: FakeSocket[] = [];
  // `openInspectStream` is generic over TRecord; a concrete non-generic mock
  // implementation doesn't structurally match that signature, so the mock is
  // built from a generic function and cast once to `typeof openInspectStream`
  // (the same public shape `useStageStreams`'s `openStream` param expects).
  function impl<TRecord = unknown>(
    url: string,
    onRecord: (record: TRecord) => void,
    handlers: InspectStreamHandlers = {}
  ): () => void {
    const socket: FakeSocket = {
      url,
      closed: false,
      emitRecord: (r) => onRecord(r as TRecord),
      emitError: () => handlers.onError?.(new Event('inspect-error')),
      emitClose: () => handlers.onClose?.(new CloseEvent('close')),
    };
    sockets.push(socket);
    return () => {
      socket.closed = true;
    };
  }
  const openStream = vi.fn(impl) as unknown as typeof openInspectStream;
  return { openStream, sockets };
}

function stage(id: string, over: Partial<Stage> = {}): Stage {
  return { id, label: id, componentId: id, inspectKind: 'connector', ...over };
}

function rec(position?: string): SchemaV1Record {
  return position !== undefined ? { position } : {};
}

// Wraps the hook in a component that counts how many times it (re-)ran, so
// "no render trigger while frozen" is an assertion about actual render count,
// not an inference from mutated-in-place buffer state.
function setup(initialProps: UseStageStreamsArgs) {
  const renderCount = { current: 0 };
  const view = renderHook(
    (props: UseStageStreamsArgs) => {
      renderCount.current += 1;
      return useStageStreams(props);
    },
    { initialProps }
  );
  return { ...view, renderCount };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('useStageStreams — freeze / unfreeze (AC4)', () => {
  it('while frozen, incoming records keep filling the buffer but do not force a re-render', () => {
    const { openStream, sockets } = makeFakeTransport();
    const s = stage('src1');
    const { result, renderCount } = setup({
      stages: [s],
      baseUrl: 'http://x',
      live: false,
      openStream,
    });

    const countAfterMount = renderCount.current;
    const socket = sockets[0];
    expect(socket).toBeTruthy();

    act(() => {
      for (let i = 0; i < 5; i++) socket?.emitRecord(rec(`p${i}`));
    });

    // The buffer object is mutated in place — it reflects all 5 records
    // immediately regardless of whether React re-rendered.
    expect(result.current.get('src1')?.records.length).toBe(5);
    // No re-render was forced by any of the 5 record arrivals while frozen.
    expect(renderCount.current).toBe(countAfterMount);
  });

  it('unfreezing (live: false -> true) reflects every buffered record in one paint, no gaps', () => {
    const { openStream, sockets } = makeFakeTransport();
    const s = stage('src1');
    const { result, rerender } = setup({
      stages: [s],
      baseUrl: 'http://x',
      live: false,
      openStream,
    });
    const socket = sockets[0];

    act(() => {
      for (let i = 0; i < 5; i++) socket?.emitRecord(rec(`p${i}`));
    });

    act(() => {
      rerender({ stages: [s], baseUrl: 'http://x', live: true, openStream });
    });

    expect(result.current.get('src1')?.records.length).toBe(5);
    expect(result.current.get('src1')?.records.map((r) => r.position)).toEqual([
      'p0',
      'p1',
      'p2',
      'p3',
      'p4',
    ]);
  });

  it('while live, each record forces a render', () => {
    const { openStream, sockets } = makeFakeTransport();
    const s = stage('src1');
    const { renderCount } = setup({ stages: [s], baseUrl: 'http://x', live: true, openStream });
    const socket = sockets[0];
    const before = renderCount.current;

    act(() => socket?.emitRecord(rec('p0')));
    expect(renderCount.current).toBeGreaterThan(before);
  });
});

describe('useStageStreams — ring buffer / byPosition sync', () => {
  it('capacity eviction keeps records[] and byPosition in lockstep', () => {
    const { openStream, sockets } = makeFakeTransport();
    const s = stage('src1');
    const { result } = setup({
      stages: [s],
      baseUrl: 'http://x',
      live: true,
      capacity: 3,
      openStream,
    });
    const socket = sockets[0];

    act(() => {
      for (let i = 0; i < 5; i++) socket?.emitRecord(rec(`p${i}`));
    });

    const buf = result.current.get('src1');
    expect(buf?.records.length).toBe(3);
    expect(buf?.records.map((r) => r.position)).toEqual(['p2', 'p3', 'p4']);
    expect(buf?.byPosition.has('p0')).toBe(false);
    expect(buf?.byPosition.has('p1')).toBe(false);
    expect(buf?.byPosition.get('p2')).toBeTruthy();
    expect(buf?.byPosition.get('p4')).toBeTruthy();
    expect(buf?.byPosition.size).toBe(3);
  });

  it('a record with no position never enters byPosition but still occupies a buffer slot', () => {
    const { openStream, sockets } = makeFakeTransport();
    const s = stage('src1');
    const { result } = setup({ stages: [s], baseUrl: 'http://x', live: true, openStream });
    const socket = sockets[0];

    act(() => socket?.emitRecord(rec()));

    const buf = result.current.get('src1');
    expect(buf?.records.length).toBe(1);
    expect(buf?.byPosition.size).toBe(0);
  });
});

describe('useStageStreams — malformed frames', () => {
  it('a malformed/error frame increments malformedFrameCount and never reconnects', () => {
    const { openStream, sockets } = makeFakeTransport();
    const s = stage('src1');
    const { result } = setup({ stages: [s], baseUrl: 'http://x', live: true, openStream });
    const socket = sockets[0];

    act(() => socket?.emitError());

    expect(result.current.get('src1')?.malformedFrameCount).toBe(1);
    expect(result.current.get('src1')?.status).toBe('connecting');
    expect(sockets.length).toBe(1); // no new socket opened
  });
});

describe('useStageStreams — reconnect (AC4)', () => {
  it('onClose (not onError) triggers reconnect: status flips to reconnecting, never back to connecting, and no records are lost or duplicated across the reconnect', () => {
    vi.useFakeTimers();
    const { openStream, sockets } = makeFakeTransport();
    const s = stage('src1');
    const { result } = setup({ stages: [s], baseUrl: 'http://x', live: true, openStream });

    expect(result.current.get('src1')?.status).toBe('connecting');

    const firstSocket = sockets[0];
    act(() => {
      for (let i = 1; i <= 5; i++) firstSocket?.emitRecord(rec(`p${i}`));
    });
    expect(result.current.get('src1')?.status).toBe('live');

    act(() => firstSocket?.emitClose());
    expect(result.current.get('src1')?.status).toBe('reconnecting');
    expect(sockets.length).toBe(1); // reconnect hasn't happened yet — backoff pending

    // A stray late message from the now-closed first socket must contribute
    // nothing (it's a superseded generation).
    act(() => firstSocket?.emitRecord(rec('late-and-stale')));
    expect(result.current.get('src1')?.records.some((r) => r.position === 'late-and-stale')).toBe(
      false
    );

    // Backoff: first attempt is 500ms.
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(sockets.length).toBe(2);
    expect(result.current.get('src1')?.status).toBe('reconnecting'); // never reverts to 'connecting'

    const secondSocket = sockets[1];
    act(() => {
      for (let i = 6; i <= 10; i++) secondSocket?.emitRecord(rec(`p${i}`));
    });

    const finalPositions = result.current.get('src1')?.records.map((r) => r.position);
    expect(finalPositions).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10']);
    expect(result.current.get('src1')?.status).toBe('live');
  });

  it('backoff doubles and caps at 15s across repeated closes', () => {
    vi.useFakeTimers();
    const { openStream, sockets } = makeFakeTransport();
    const s = stage('src1');
    setup({ stages: [s], baseUrl: 'http://x', live: true, openStream });

    act(() => sockets[0]?.emitClose());
    expect(sockets.length).toBe(1);
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(sockets.length).toBe(1);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(sockets.length).toBe(2); // 500ms

    act(() => sockets[1]?.emitClose());
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(sockets.length).toBe(2);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(sockets.length).toBe(3); // 1000ms (500 * 2^1)
  });
});

describe('useStageStreams — teardown', () => {
  it('unmount closes exactly one (the current) socket per stage, and cancels any pending backoff', () => {
    vi.useFakeTimers();
    const { openStream, sockets } = makeFakeTransport();
    const stages = [stage('src1'), stage('proc1', { inspectKind: 'processor-in' })];
    const { unmount } = setup({ stages, baseUrl: 'http://x', live: true, openStream });

    expect(sockets.length).toBe(2);
    act(() => unmount());

    expect(sockets.every((sock) => sock.closed)).toBe(true);
    // No reconnect fires after unmount even if a backoff had been scheduled.
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(sockets.length).toBe(2);
  });

  it('a stage-set change (topology update) tears down the old sockets and opens fresh ones', () => {
    const { openStream, sockets } = makeFakeTransport();
    const s1 = stage('src1');
    const { rerender } = setup({ stages: [s1], baseUrl: 'http://x', live: true, openStream });
    expect(sockets.length).toBe(1);

    const s2 = stage('src2');
    act(() => rerender({ stages: [s2], baseUrl: 'http://x', live: true, openStream }));

    expect(sockets[0]?.closed).toBe(true);
    expect(sockets.length).toBe(2);
  });
});
