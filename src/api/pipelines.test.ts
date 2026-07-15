import { describe, it, expect, vi, afterEach } from 'vitest';
import { createConduitClient } from './client';
import { fetchPipelines } from './pipelines';

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
