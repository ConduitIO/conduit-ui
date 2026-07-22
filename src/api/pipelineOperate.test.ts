import { describe, it, expect, vi, afterEach } from 'vitest';
import { createConduitClient } from './client';
import { startPipeline, stopPipeline, PipelineOperateError } from './pipelineOperate';

afterEach(() => vi.unstubAllGlobals());

function stubFetch(body: unknown, status: number) {
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

describe('startPipeline', () => {
  it('resolves without throwing on a 200 (empty body)', async () => {
    stubFetch({}, 200);
    await expect(
      startPipeline(createConduitClient('http://engine'), 'p1')
    ).resolves.toBeUndefined();
  });

  it('throws PipelineOperateError with the gRPC code/message on a 400 (failed precondition)', async () => {
    stubFetch({ code: 9, message: 'pipeline already running' }, 400);
    await expect(startPipeline(createConduitClient('http://engine'), 'p1')).rejects.toMatchObject({
      name: 'PipelineOperateError',
      code: 9,
      grpcMessage: 'pipeline already running',
    });
  });

  it('throws with an HTTP-status fallback message when the engine sends no body', async () => {
    stubFetch({}, 500);
    let caught: unknown;
    try {
      await startPipeline(createConduitClient('http://engine'), 'p1');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PipelineOperateError);
    expect((caught as PipelineOperateError).message).toMatch(/HTTP 500/);
  });
});

describe('stopPipeline', () => {
  it('resolves without throwing on a 200 (empty body)', async () => {
    stubFetch({}, 200);
    await expect(stopPipeline(createConduitClient('http://engine'), 'p1')).resolves.toBeUndefined();
  });

  it('sends a body with no `force` key — v0.18 never forces a stop', async () => {
    stubFetch({}, 200);
    await stopPipeline(createConduitClient('http://engine'), 'p1');
    const fetchMock = vi.mocked(fetch);
    // openapi-fetch's custom `fetch` hook (and the global fetch it wraps) is
    // invoked with a single Request object, not (url, init).
    const [request] = fetchMock.mock.calls[0] as [Request];
    const sentBody: unknown = JSON.parse(await request.text());
    expect(sentBody).not.toHaveProperty('force');
  });

  it('surfaces a 404 (pipeline not found) verbatim, not a generic message', async () => {
    stubFetch({ code: 5, message: 'pipeline "p1" not found' }, 404);
    await expect(stopPipeline(createConduitClient('http://engine'), 'p1')).rejects.toMatchObject({
      code: 5,
      grpcMessage: 'pipeline "p1" not found',
    });
  });
});
