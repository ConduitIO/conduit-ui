import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { fetchMetricsText, parseInspectorDroppedCounters, useDropRates } from './dropRate';

// React 19 doesn't synchronously flush a state update that originates from a
// fake-timer callback (react-query's refetch notification) unless it's wrapped
// in `act`, hence the `act(async () => ...)` wrapper around every timer advance
// below rather than a bare `await vi.advanceTimersByTimeAsync(...)`.
async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('parseInspectorDroppedCounters', () => {
  it('extracts component_id -> value for the target metric family only, ignoring other families', () => {
    const text = [
      '# HELP conduit_inspector_dropped_records_total docs',
      '# TYPE conduit_inspector_dropped_records_total counter',
      'conduit_inspector_dropped_records_total{component_id="c1"} 5',
      'conduit_inspector_dropped_records_total{component_id="c2",pipeline_id="p1"} 12',
      'some_unrelated_metric{component_id="c1"} 999',
      '',
    ].join('\n');
    const parsed = parseInspectorDroppedCounters(text);
    expect(parsed.get('c1')).toBe(5);
    expect(parsed.get('c2')).toBe(12);
    expect(parsed.size).toBe(2);
  });

  it('ignores malformed or unlabeled lines without throwing', () => {
    const text = [
      'conduit_inspector_dropped_records_total{no_component_id="x"} 5',
      'conduit_inspector_dropped_records_total{component_id="c1"} not-a-number',
      'conduit_inspector_dropped_records_total broken-line-no-braces',
    ].join('\n');
    expect(() => parseInspectorDroppedCounters(text)).not.toThrow();
    expect(parseInspectorDroppedCounters(text).size).toBe(0);
  });

  it('empty text yields an empty map', () => {
    expect(parseInspectorDroppedCounters('').size).toBe(0);
  });
});

describe('fetchMetricsText', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetches baseUrl + /metrics and returns the body text', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('body') });
    vi.stubGlobal('fetch', fetchMock);
    const text = await fetchMetricsText('http://host:8080/');
    expect(fetchMock).toHaveBeenCalledWith('http://host:8080/metrics', {});
    expect(text).toBe('body');
  });

  it('throws on a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('') })
    );
    await expect(fetchMetricsText('http://host')).rejects.toThrow(/500/);
  });
});

describe('useDropRates', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function makeWrapper(client: QueryClient) {
    return function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    };
  }

  it('first poll is undefined (no previous sample); a later poll computes rec/sec; a counter decrease resets to undefined', async () => {
    vi.useFakeTimers();
    const values = [10, 20, 5]; // third simulates a process-restart counter reset
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        const v = values[call] ?? values[values.length - 1];
        call += 1;
        return Promise.resolve({
          ok: true,
          text: () =>
            Promise.resolve(`conduit_inspector_dropped_records_total{component_id="c1"} ${v}`),
        });
      })
    );

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, unmount } = renderHook(() => useDropRates('http://host', ['c1'], 1000), {
      wrapper: makeWrapper(client),
    });

    await advance(0);
    expect(result.current.get('c1')).toBeUndefined();

    // A refetch scheduled exactly at the `pollMs` boundary resolves through a
    // promise chain (fetch -> text() -> parse) that the fake-timer engine only
    // finishes flushing on the timer tick just past the boundary — advancing
    // 1ms further than pollMs (rather than exactly pollMs) reliably observes
    // the settled result instead of racing it.
    await advance(1001);
    // ~1ms of the advance is spent flushing the promise chain rather than
    // elapsing "rate" time, so the observed rate is very close to but not
    // exactly (20-10)/1s — assert closeness, not exact equality.
    expect(result.current.get('c1')).toBeCloseTo(10, 1);

    await advance(1001);
    expect(result.current.get('c1')).toBeUndefined(); // 5 < 20 -> reset, not -15/sec

    unmount();
    client.clear();
  });

  it('a componentId absent from the scrape reports undefined', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve('conduit_inspector_dropped_records_total{component_id="other"} 3'),
      })
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, unmount } = renderHook(() => useDropRates('http://host', ['missing'], 1000), {
      wrapper: makeWrapper(client),
    });
    await advance(0);
    expect(result.current.get('missing')).toBeUndefined();
    unmount();
    client.clear();
  });
});
