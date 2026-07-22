import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, within, cleanup, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axe from 'axe-core';
import type {
  SchemaV1Pipeline,
  SchemaApiv1Connector,
  SchemaApiv1Processor,
} from '../../api/schema';
import { PipelineNotFoundError, type Topology } from '../../api/pipelineDetail';
import type { ConnectorRate, PipelineMetricsSnapshot } from '../../api/pipelineMetrics';
import { PipelineDetailContent, type PipelineDetailContentProps } from './PipelineDetail';
import '../../tokens/tokens.css';

function pipeline(over: Partial<SchemaV1Pipeline> = {}): SchemaV1Pipeline {
  return {
    id: 'p1',
    config: { name: 'My Pipeline', description: 'a pipeline' },
    state: { status: 'STATUS_RUNNING' },
    connectorIds: [],
    processorIds: [],
    ...over,
  };
}

function conn(
  id: string,
  type: NonNullable<SchemaApiv1Connector['type']>,
  over: Partial<SchemaApiv1Connector> = {}
): SchemaApiv1Connector {
  return { id, type, plugin: `builtin:${id}`, config: { name: id }, processorIds: [], ...over };
}
function proc(id: string): SchemaApiv1Processor {
  return { id, plugin: `builtin:${id}` };
}

function topo(over: Partial<Topology> = {}): Topology {
  return { connectors: [], processors: [], processorsUnavailable: false, ...over };
}

type Q<T> = {
  data: T | undefined;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  dataUpdatedAt: number;
  errorUpdatedAt: number;
  isFetching: boolean;
};
function q<T>(data: T | undefined, over: Partial<Q<T>> = {}): Q<T> {
  return {
    data,
    isPending: false,
    isError: false,
    error: null,
    dataUpdatedAt: 0,
    errorUpdatedAt: 0,
    isFetching: false,
    ...over,
  };
}

// UI-4's RecordFlow (rendered inside TopologySection's non-empty branch) needs
// a QueryClientProvider (useDropRates) and opens real Inspect websockets for
// the primary stage (useStageStreams) — neither existed when this file was
// written for UI-3. A no-op FakeWS + a resolved-empty fetch keep these tests
// from attempting a real network connection; QueryClient retry is off so a
// failed /metrics poll doesn't slow the test down. OperateControls (UI-6)
// also uses TanStack Query mutations, so every render needs the same
// QueryClientProvider ancestor even though `detail`/`topology` here are plain
// fixtures, not live queries. The client is returned so a rerender (the
// reconciliation test below) can reuse the same provider instance.
class NoopFakeWebSocket {
  addEventListener() {
    /* never emits — these tests don't exercise live record flow */
  }
  close() {
    /* no-op */
  }
}

function rate(over: Partial<ConnectorRate> = {}): ConnectorRate {
  return {
    plugin: 'builtin:d1',
    pluginType: 'destination',
    componentId: undefined,
    recordsPerSec: undefined,
    bytesPerSec: undefined,
    p95LatencySeconds: undefined,
    ...over,
  };
}

function metricsSnapshot(over: Partial<PipelineMetricsSnapshot> = {}): PipelineMetricsSnapshot {
  return {
    connectorRates: [],
    hasComponentId: false,
    observedAt: Date.now(),
    ...over,
  };
}

function renderContent(props: Partial<PipelineDetailContentProps> = {}) {
  vi.stubGlobal('WebSocket', NoopFakeWebSocket);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('') }));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PipelineDetailContent
          id={props.id ?? 'p1'}
          detail={props.detail ?? q(pipeline())}
          topology={props.topology ?? q(topo())}
          metrics={props.metrics}
          baseUrl={props.baseUrl}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...result, queryClient };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('PipelineDetailContent — identity & status', () => {
  it('AC1: renders name, id, description and the status badge from describePipelineStatus', () => {
    renderContent({ detail: q(pipeline({ state: { status: 'STATUS_RUNNING' } })) });
    expect(screen.getByRole('heading', { name: 'My Pipeline' })).toBeTruthy();
    expect(screen.getByText('Running')).toBeTruthy();
    expect(screen.getByText('a pipeline')).toBeTruthy();
    expect(screen.getByText('p1')).toBeTruthy();
  });

  it('AC1: a system-stopped pipeline is labelled distinctly from a user stop', () => {
    renderContent({
      detail: q(
        pipeline({
          state: {
            status: 'STATUS_STOPPED',
            stoppedReason: 'STOPPED_REASON_SYSTEM',
          },
        })
      ),
    });
    expect(screen.getByText('Stopped (system)')).toBeTruthy();
  });
});

describe('PipelineDetailContent — topology', () => {
  const built = pipeline({ connectorIds: ['s1', 'd1'], processorIds: ['a', 'b'] });
  const t = topo({
    connectors: [conn('s1', 'TYPE_SOURCE'), conn('d1', 'TYPE_DESTINATION')],
    // processors returned OUT of order to prove order comes from processorIds
    processors: [proc('b'), proc('a')],
  });

  it('AC2: renders a topology region with sources, processors, destinations', () => {
    renderContent({ detail: q(built), topology: q(t) });
    const graph = screen.getByRole('region', { name: /My Pipeline topology/i });
    expect(within(graph).getByText('builtin:s1')).toBeTruthy();
    expect(within(graph).getByText('builtin:d1')).toBeTruthy();
    // screen-reader direction summary carries the per-column counts
    expect(graph.textContent).toMatch(/1 source .*2 pipeline processors .*1 destination/s);
  });

  it('AC3: pipeline processors render in processorIds order (a before b), not response order', () => {
    renderContent({ detail: q(built), topology: q(t) });
    const graph = screen.getByRole('region', { name: /topology/i });
    const text = graph.textContent ?? '';
    expect(text.indexOf('builtin:a')).toBeGreaterThan(-1);
    expect(text.indexOf('builtin:a')).toBeLessThan(text.indexOf('builtin:b'));
  });

  it('AC10: a connectorId with no object renders an unavailable placeholder, no crash', () => {
    renderContent({
      detail: q(pipeline({ connectorIds: ['s1', 'ghost'] })),
      topology: q(topo({ connectors: [conn('s1', 'TYPE_SOURCE')] })),
    });
    const graph = screen.getByRole('region', { name: /topology/i });
    expect(within(graph).getByText('ghost')).toBeTruthy();
    expect(within(graph).getAllByText('unavailable').length).toBeGreaterThan(0);
  });
});

describe('PipelineDetailContent — states', () => {
  it('AC4: a 404 renders a not-found state naming the id, not an error/loading state', () => {
    renderContent({
      id: 'nope',
      detail: q(undefined, { isError: true, error: new PipelineNotFoundError('nope') }),
    });
    expect(screen.getByRole('heading', { name: /not found/i })).toBeTruthy();
    expect(screen.getByText('nope')).toBeTruthy();
    expect(screen.queryByText(/loading pipeline/i)).toBeNull();
  });

  it('AC5: first load renders a skeleton', () => {
    renderContent({ detail: q(undefined, { isPending: true }) });
    expect(screen.getByText(/loading pipeline/i)).toBeTruthy();
  });

  it('AC5: engine unreachable at load names the target', () => {
    renderContent({
      detail: q(undefined, { isError: true, error: new Error('down') }),
      baseUrl: 'http://localhost:8080',
    });
    expect(screen.getByRole('alert').textContent).toContain('http://localhost:8080');
  });

  it('AC5: an empty pipeline (no connectors) shows an empty-graph message, not a blank box', () => {
    renderContent({ detail: q(pipeline({ connectorIds: [] })), topology: q(topo()) });
    expect(screen.getByText(/no connectors configured/i)).toBeTruthy();
  });

  it('0 connectors but dangling processors still renders the graph, not the empty message', () => {
    // A pipeline mid-reconfiguration: connectors deleted but processor config lingers.
    // The processors must be visible (they are likely the problem), not hidden behind
    // "no connectors configured".
    renderContent({
      detail: q(pipeline({ connectorIds: [], processorIds: ['a'] })),
      topology: q(topo({ processors: [proc('a')] })),
    });
    expect(screen.queryByText(/no connectors configured/i)).toBeNull();
    const graph = screen.getByRole('region', { name: /topology/i });
    expect(within(graph).getByText('builtin:a')).toBeTruthy();
  });
});

describe('PipelineDetailContent — resilience (AC9)', () => {
  it('keeps identity + shows a stale banner when the detail refetch fails', () => {
    renderContent({ detail: q(pipeline(), { isError: true, error: new Error('refresh failed') }) });
    expect(screen.getByRole('heading', { name: 'My Pipeline' })).toBeTruthy();
    expect(screen.getByText(/last-known state/i)).toBeTruthy();
  });

  it('shows a connectors-only note when processors are unavailable', () => {
    renderContent({
      detail: q(pipeline({ connectorIds: ['s1'] })),
      topology: q(topo({ connectors: [conn('s1', 'TYPE_SOURCE')], processorsUnavailable: true })),
    });
    expect(screen.getByText(/processor details are temporarily unavailable/i)).toBeTruthy();
    expect(screen.getByText('builtin:s1')).toBeTruthy();
  });

  it('shows a topology-unavailable note (identity still renders) when topology fails with no data', () => {
    renderContent({
      detail: q(pipeline()),
      topology: q(undefined, { isError: true, error: new Error('boom') }),
    });
    expect(screen.getByRole('heading', { name: 'My Pipeline' })).toBeTruthy();
    expect(screen.getByText(/topology unavailable/i)).toBeTruthy();
  });
});

describe('PipelineDetailContent — reconciliation (AC8)', () => {
  it('a status change between polls updates the badge', () => {
    const { rerender, queryClient } = renderContent({
      detail: q(pipeline({ state: { status: 'STATUS_RUNNING' } })),
    });
    expect(screen.getByText('Running')).toBeTruthy();
    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <PipelineDetailContent
            id="p1"
            detail={q(pipeline({ state: { status: 'STATUS_DEGRADED', error: 'boom' } }))}
            topology={q(topo())}
          />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByText('Degraded')).toBeTruthy();
  });
});

describe('PipelineDetailContent — operate controls in the header (UI-6)', () => {
  it('a Running pipeline shows Stop next to the status badge', () => {
    renderContent({ detail: q(pipeline({ state: { status: 'STATUS_RUNNING' } })) });
    expect(screen.getByRole('button', { name: /stop pipeline/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /start pipeline/i })).toBeNull();
  });

  it('a Degraded pipeline shows Restart, not Start', () => {
    renderContent({
      detail: q(pipeline({ state: { status: 'STATUS_DEGRADED', error: 'boom' } })),
    });
    expect(screen.getByRole('button', { name: 'Restart pipeline' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /stop pipeline/i })).toBeNull();
  });

  it('a Stopped pipeline shows Start, not Stop', () => {
    renderContent({
      detail: q(
        pipeline({ state: { status: 'STATUS_STOPPED', stoppedReason: 'STOPPED_REASON_USER' } })
      ),
    });
    expect(screen.getByRole('button', { name: 'Start pipeline' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /stop pipeline/i })).toBeNull();
  });
});

describe('PipelineDetailContent — a11y & scale', () => {
  it('AC6: axe clean, semantic lists, and a screen-reader direction summary', async () => {
    const { container } = renderContent({
      detail: q(pipeline({ connectorIds: ['s1', 'd1'], processorIds: ['a'] })),
      topology: q(
        topo({
          connectors: [conn('s1', 'TYPE_SOURCE'), conn('d1', 'TYPE_DESTINATION')],
          processors: [proc('a')],
        })
      ),
    });
    const graph = screen.getByRole('region', { name: /topology/i });
    expect(within(graph).getAllByRole('listitem').length).toBeGreaterThan(0);
    expect(graph.textContent).toMatch(/data flows left to right/i);
    // Flushes RecordFlow's stubbed-fetch promise chain (useDropRates' first
    // poll). TanStack Query's internal notifyManager schedules the resulting
    // state update via a real macrotask (`setTimeout(fn, 0)`), not just a
    // microtask, so a plain `await act(async () => {})` isn't enough — this
    // waits a real tick, inside `act`, so it lands before the `await axe.run`
    // below rather than mid-flight and outside any act() wrapper.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    // color-contrast is disabled because jsdom can't resolve color-mix()/custom
    // properties — this asserts structural a11y, NOT verified AA contrast (that's
    // checked with real-browser tooling, a known gap here).
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });

  it('AC7: a 200-source fixture renders every node with the status badge visible', () => {
    const connectorIds = Array.from({ length: 200 }, (_, i) => `s${i}`);
    const connectors = connectorIds.map((id) => conn(id, 'TYPE_SOURCE'));
    renderContent({
      detail: q(pipeline({ connectorIds })),
      topology: q(topo({ connectors })),
    });
    // status badge is never collapsed
    expect(screen.getByText('Running')).toBeTruthy();
    const graph = screen.getByRole('region', { name: /topology/i });
    // every source node is in the DOM (nothing hidden from assistive tech)
    expect(within(graph).getByText('builtin:s0')).toBeTruthy();
    expect(within(graph).getByText('builtin:s199')).toBeTruthy();
    expect(graph.textContent).toMatch(/200 sources/);
  });
});

describe('PipelineDetailContent — metrics (UI-5 review fixes)', () => {
  // Fix 1 (P1 — accessibility honesty bug): a pipeline that has gone
  // Running -> Stopped keeps its last-polled `metrics.data` around (the query
  // doesn't clear on state change). If a stopped pipeline's byte counters have
  // stopped increasing, the derived rate settles at 0 -> a defined, non-'unknown'
  // 'idle' reading. Before the fix, `activitySummary` was computed unconditionally
  // and fed to `TopologyGraph`, whose SR-only sentence is gated only on
  // `activity !== 'unknown'` (no concept of `running`) -> it would announce
  // "Pipeline is currently idle" for a Stopped pipeline, a false claim on the SR
  // channel even though the visible `PipelineActivityBadge` correctly renders
  // nothing. This test fails against the unfixed code and passes once
  // `activitySummary` is gated on `running` the same way `nodeMetrics` is.
  it('Fix 1 regression: a Stopped pipeline never reports "idle"/"flowing" from stale metrics, on either the visual or SR channel', () => {
    const built = pipeline({
      connectorIds: ['s1', 'd1'],
      state: { status: 'STATUS_STOPPED' },
    });
    const t = topo({
      connectors: [conn('s1', 'TYPE_SOURCE'), conn('d1', 'TYPE_DESTINATION')],
    });
    // Stale snapshot from before the stop: a destination rate whose recordsPerSec
    // is defined-but-zero derives to 'idle', not 'unknown'.
    const staleMetrics = metricsSnapshot({
      connectorRates: [
        rate({ pluginType: 'destination', componentId: 'd1', recordsPerSec: 0, bytesPerSec: 0 }),
      ],
      hasComponentId: true,
    });

    renderContent({ detail: q(built), topology: q(t), metrics: q(staleMetrics) });

    // The visible pipeline-level badge already guards on `running` internally —
    // assert it stays silent (sanity check, not the regression itself).
    expect(screen.queryByText(/idle — no recent activity/i)).toBeNull();
    expect(screen.queryByText('Flowing')).toBeNull();

    // The regression is the SR-only sentence inside the topology region, which had
    // no `running` gate of its own before the fix.
    const graph = screen.getByRole('region', { name: /topology/i });
    expect(graph.textContent).not.toMatch(/idle/i);
    expect(graph.textContent).not.toMatch(/flowing/i);
    expect(graph.textContent).not.toMatch(/pipeline is currently/i);

    // Belt-and-braces: nowhere in the document at all.
    expect(document.body.textContent).not.toMatch(/pipeline is currently/i);
  });

  it('metrics-unavailable: /metrics failing with no prior data shows the "showing topology only" banner and keeps the topology visible', () => {
    const built = pipeline({ connectorIds: ['s1', 'd1'] });
    const t = topo({
      connectors: [conn('s1', 'TYPE_SOURCE'), conn('d1', 'TYPE_DESTINATION')],
    });

    renderContent({
      detail: q(built),
      topology: q(t),
      metrics: q(undefined, { isError: true, error: new Error('metrics down') }),
    });

    expect(screen.getByText(/metrics unavailable/i)).toBeTruthy();
    expect(screen.getByText(/showing topology only/i)).toBeTruthy();
    const graph = screen.getByRole('region', { name: /topology/i });
    expect(within(graph).getByText('builtin:s1')).toBeTruthy();
    expect(within(graph).getByText('builtin:d1')).toBeTruthy();
  });

  it('metrics-stale: /metrics failing after prior data existed shows the "may be stale" banner', () => {
    const built = pipeline({ connectorIds: ['s1'] });
    const t = topo({ connectors: [conn('s1', 'TYPE_SOURCE')] });

    renderContent({
      detail: q(built),
      topology: q(t),
      metrics: q(metricsSnapshot(), { isError: true, error: new Error('refresh failed') }),
    });

    expect(screen.getByText(/metrics may be stale/i)).toBeTruthy();
  });

  it('graceful degradation: a /metrics failure never blanks the topology, mirroring the processorsUnavailable contract', () => {
    const built = pipeline({ connectorIds: ['s1', 'd1'], processorIds: ['a'] });
    const t = topo({
      connectors: [conn('s1', 'TYPE_SOURCE'), conn('d1', 'TYPE_DESTINATION')],
      processors: [proc('a')],
    });

    renderContent({
      detail: q(built),
      topology: q(t),
      metrics: q(undefined, { isError: true, error: new Error('down') }),
    });

    expect(screen.queryByText(/no connectors configured/i)).toBeNull();
    const graph = screen.getByRole('region', { name: /topology/i });
    expect(within(graph).getByText('builtin:s1')).toBeTruthy();
    expect(within(graph).getByText('builtin:d1')).toBeTruthy();
    expect(within(graph).getByText('builtin:a')).toBeTruthy();
  });
});
