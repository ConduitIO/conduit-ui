import { describe, it, expect, vi, afterEach } from 'vitest';
import { createConduitClient } from './client';
import {
  fetchPipeline,
  fetchTopology,
  pipelineDetailQueryOptions,
  PipelineNotFoundError,
} from './pipelineDetail';

afterEach(() => vi.unstubAllGlobals());

// Route fetch by URL so one stub serves the multi-call topology assembly.
function stubRoutes(routes: Array<{ match: RegExp; status?: number; body: unknown }>) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: Request | string) => {
      const url = typeof input === 'string' ? input : input.url;
      calls.push(url);
      const route = routes.find((r) => r.match.test(url));
      const status = route?.status ?? 200;
      const body = route ? route.body : null;
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        })
      );
    })
  );
  return calls;
}

describe('fetchPipeline', () => {
  it('returns the bare v1Pipeline on 200', async () => {
    stubRoutes([{ match: /\/v1\/pipelines\/p1$/, body: { id: 'p1', config: { name: 'p1' } } }]);
    const p = await fetchPipeline(createConduitClient('http://engine'), 'p1');
    expect(p.id).toBe('p1');
  });

  it('throws PipelineNotFoundError on 404', async () => {
    stubRoutes([{ match: /\/v1\/pipelines\/nope$/, status: 404, body: { code: 5, message: 'x' } }]);
    await expect(
      fetchPipeline(createConduitClient('http://engine'), 'nope')
    ).rejects.toBeInstanceOf(PipelineNotFoundError);
  });

  it('throws a generic error (not not-found) on 500', async () => {
    stubRoutes([{ match: /\/v1\/pipelines\/p1$/, status: 500, body: { message: 'boom' } }]);
    const err = await fetchPipeline(createConduitClient('http://engine'), 'p1').catch(
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(PipelineNotFoundError);
  });
});

describe('fetchTopology', () => {
  it('assembles from one ?pipelineId connectors call + one ?parentIds processors call (no N+1)', async () => {
    const calls = stubRoutes([
      {
        match: /\/v1\/connectors\?/,
        body: [
          { id: 'c1', type: 'TYPE_SOURCE' },
          { id: 'c2', type: 'TYPE_DESTINATION' },
        ],
      },
      {
        match: /\/v1\/processors\?/,
        body: [{ id: 'pr1', parent: { type: 'TYPE_PIPELINE', id: 'p1' } }],
      },
    ]);
    const topo = await fetchTopology(createConduitClient('http://engine'), 'p1');
    expect(topo.connectors.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(topo.processors.map((p) => p.id)).toEqual(['pr1']);
    expect(topo.processorsUnavailable).toBe(false);

    // connectors filtered by pipelineId; processors by repeated parentIds = [p1, c1, c2]
    const connCall = calls.find((u) => u.includes('/v1/connectors'));
    const procCall = calls.find((u) => u.includes('/v1/processors'));
    expect(connCall).toContain('pipelineId=p1');
    expect(procCall).toContain('parentIds=p1');
    expect(procCall).toContain('parentIds=c1');
    expect(procCall).toContain('parentIds=c2');
    // no per-id processor GET
    expect(calls.some((u) => /\/v1\/processors\/[^?]/.test(u))).toBe(false);
  });

  it('degrades to connectors-only (processorsUnavailable) when the processors call fails', async () => {
    stubRoutes([
      { match: /\/v1\/connectors\?/, body: [{ id: 'c1', type: 'TYPE_SOURCE' }] },
      { match: /\/v1\/processors\?/, status: 500, body: { message: 'boom' } },
    ]);
    const topo = await fetchTopology(createConduitClient('http://engine'), 'p1');
    expect(topo.connectors).toHaveLength(1);
    expect(topo.processors).toHaveLength(0);
    expect(topo.processorsUnavailable).toBe(true);
  });

  it('throws when the connectors call fails (no graph without connectors → keep-last-known)', async () => {
    stubRoutes([{ match: /\/v1\/connectors\?/, status: 500, body: { message: 'boom' } }]);
    await expect(fetchTopology(createConduitClient('http://engine'), 'p1')).rejects.toThrow(
      /HTTP 500/
    );
  });
});

describe('detail query retry policy', () => {
  it('never retries a 404, backs off others up to 3', () => {
    const { retry } = pipelineDetailQueryOptions('p1');
    expect(retry(0, new PipelineNotFoundError('p1'))).toBe(false);
    expect(retry(0, new Error('boom'))).toBe(true);
    expect(retry(2, new Error('boom'))).toBe(true);
    expect(retry(3, new Error('boom'))).toBe(false);
  });
});
