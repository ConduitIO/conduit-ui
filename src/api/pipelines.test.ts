import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { createConduitClient } from './client';
import { fetchPipelines, pipelinesQueryOptions } from './pipelines';

afterEach(() => vi.unstubAllGlobals());

function stubFetch(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        })
      )
    )
  );
}

describe('fetchPipelines', () => {
  it('parses the bare v1Pipeline[] 200 body (not a {pipelines} wrapper)', async () => {
    stubFetch([
      { id: 'a', state: { status: 'STATUS_RUNNING' } },
      { id: 'b', state: { status: 'STATUS_DEGRADED', error: 'x' } },
    ]);
    // Client created AFTER the stub so it binds the stubbed fetch.
    const result = await fetchPipelines(createConduitClient('http://engine'));
    expect(result.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('returns [] when the body is empty', async () => {
    stubFetch([]);
    expect(await fetchPipelines(createConduitClient('http://engine'))).toEqual([]);
  });

  it('throws with the status on a non-2xx response', async () => {
    stubFetch({ code: 13, message: 'boom' }, 500);
    await expect(fetchPipelines(createConduitClient('http://engine'))).rejects.toThrow(/HTTP 500/);
  });
});

describe('usePipelines resilience (query options, success -> failure)', () => {
  it('retains the last-known list when a refetch fails — never clears it to empty', async () => {
    // We drive the REAL pipelinesQueryOptions (its queryKey, refetch config, and —
    // crucially — its absence of a data-clearing onError) through an observer, but
    // override queryFn with an in-memory success-then-failure sequence. Why not the
    // real fetch: TanStack's context.signal is a jsdom AbortSignal that undici's
    // Request rejects (a jsdom/undici realm mismatch, not a product bug); the real
    // fetch+parse path is covered by the fetchPipelines tests above. This test's job
    // is to catch a regression in the OPTIONS — e.g. someone adding
    // `onError: () => setQueryData(key, [])` or making queryKey unstable — which would
    // wipe the list to a false "no pipelines" on a transient failure.
    let call = 0;
    const options = {
      ...pipelinesQueryOptions(),
      retry: false, // deterministic failure, no backoff
      queryFn: () => {
        call += 1;
        return call === 1
          ? Promise.resolve([{ id: 'a', state: { status: 'STATUS_RUNNING' } }])
          : Promise.reject(new Error('engine down'));
      },
    };

    const qc = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);
    const { result, unmount } = renderHook(() => useQuery(options), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);

    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    // The crux: data is retained, not wiped to [] (which would read as "no pipelines").
    expect(result.current.data).toHaveLength(1);

    unmount();
    qc.clear();
  });
});
