import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axe from 'axe-core';
import type {
  SchemaV1Pipeline,
  SchemaApiv1Connector,
  SchemaApiv1Processor,
} from '../../api/schema';
import { PipelineNotFoundError, type Topology } from '../../api/pipelineDetail';
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

type Q<T> = { data: T | undefined; isPending: boolean; isError: boolean; error: Error | null };
function q<T>(data: T | undefined, over: Partial<Q<T>> = {}): Q<T> {
  return { data, isPending: false, isError: false, error: null, ...over };
}

function renderContent(props: Partial<PipelineDetailContentProps> = {}) {
  return render(
    <MemoryRouter>
      <PipelineDetailContent
        id={props.id ?? 'p1'}
        detail={props.detail ?? q(pipeline())}
        topology={props.topology ?? q(topo())}
        baseUrl={props.baseUrl}
      />
    </MemoryRouter>
  );
}

afterEach(cleanup);

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
    const { rerender } = renderContent({
      detail: q(pipeline({ state: { status: 'STATUS_RUNNING' } })),
    });
    expect(screen.getByText('Running')).toBeTruthy();
    rerender(
      <MemoryRouter>
        <PipelineDetailContent
          id="p1"
          detail={q(pipeline({ state: { status: 'STATUS_DEGRADED', error: 'boom' } }))}
          topology={q(topo())}
        />
      </MemoryRouter>
    );
    expect(screen.getByText('Degraded')).toBeTruthy();
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
