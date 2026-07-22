import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axe from 'axe-core';
import type { SchemaV1Record } from '../../../api/schema';
import type { TopologyModel } from '../topology';
import type { Stage } from './stages';
import type { StageBuffer } from './useStageStreams';
import { RecordFlow, RecordFlowContent, type RecordFlowContentProps } from './RecordFlow';
import '../../../tokens/tokens.css';

function stage(id: string, over: Partial<Stage> = {}): Stage {
  return { id, label: id, componentId: id, inspectKind: 'connector', ...over };
}

function rec(over: Partial<SchemaV1Record> = {}): SchemaV1Record {
  return { position: 'p1', operation: 'OPERATION_CREATE', metadata: {}, ...over };
}

function buffer(over: Partial<StageBuffer> = {}): StageBuffer {
  return {
    status: 'live',
    records: [],
    byPosition: new Map(),
    malformedFrameCount: 0,
    ...over,
  };
}

function baseProps(over: Partial<RecordFlowContentProps> = {}): RecordFlowContentProps {
  return {
    pipelineName: 'my-pipeline',
    stages: [stage('src1')],
    buffers: new Map([['src1', buffer()]]),
    capacity: 75,
    live: true,
    onToggleLive: vi.fn(),
    keyFilter: '',
    onKeyFilterChange: vi.fn(),
    keyFilterMode: 'prefix',
    onKeyFilterModeChange: vi.fn(),
    errorsOnly: false,
    onErrorsOnlyChange: vi.fn(),
    dropRates: new Map(),
    freezeSummary: undefined,
    ...over,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('RecordFlowContent — honesty + states', () => {
  it('always shows the sampling-honesty banner', () => {
    render(<RecordFlowContent {...baseProps()} />);
    expect(screen.getByText(/not a sample/i)).toBeTruthy();
    expect(screen.getByText(/drops the newest unconsumed records/i)).toBeTruthy();
  });

  it('renders "No inspectable stages" when the topology has none, rather than an empty table', () => {
    render(<RecordFlowContent {...baseProps({ stages: [], buffers: new Map() })} />);
    expect(screen.getByText(/no inspectable stages/i)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows the Live caption and an empty-state row when there are no records yet', () => {
    render(<RecordFlowContent {...baseProps()} />);
    const table = screen.getByRole('table');
    expect(table.textContent).toMatch(/showing last 0 of up to 75, Live/);
    expect(screen.getByText(/no records observed yet/i)).toBeTruthy();
  });

  it('shows Frozen in the caption when not live', () => {
    render(<RecordFlowContent {...baseProps({ live: false })} />);
    expect(screen.getByRole('table').textContent).toMatch(/Frozen/);
  });
});

describe('RecordFlowContent — connecting vs reconnecting (AC4)', () => {
  it('connecting + empty shows a "Connecting…" banner, not a reconnecting one', () => {
    render(
      <RecordFlowContent
        {...baseProps({
          buffers: new Map([['src1', buffer({ status: 'connecting', records: [] })]]),
        })}
      />
    );
    // The visible status banner specifically (not the sr-only mode-transition
    // region, which also mentions "Connecting…" as part of a longer sentence).
    const banner = screen.getByText(/connecting/i, { selector: 'p[role="status"]' });
    expect(banner.textContent?.toLowerCase()).not.toContain('reconnect');
    expect(screen.getByText(/no records observed yet/i)).toBeTruthy();
  });

  it('reconnecting + non-empty keeps rows visible and shows a distinct reconnecting banner', () => {
    const records = [rec({ position: 'p1' }), rec({ position: 'p2' })];
    render(
      <RecordFlowContent
        {...baseProps({
          buffers: new Map([['src1', buffer({ status: 'reconnecting', records })]]),
        })}
      />
    );
    const banner = screen.getByText(/reconnecting/i, { selector: 'p[role="status"]' });
    expect(banner.textContent?.toLowerCase()).toContain('reconnecting');
    // Rows are never dropped while reconnecting.
    expect(screen.getAllByRole('row').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/no records observed yet/i)).toBeNull();
  });

  it('connecting and reconnecting banners are non-overlapping / mutually exclusive UI', () => {
    const { rerender } = render(
      <RecordFlowContent
        {...baseProps({
          buffers: new Map([['src1', buffer({ status: 'connecting', records: [] })]]),
        })}
      />
    );
    expect(screen.queryByText(/reconnecting/i, { selector: 'p[role="status"]' })).toBeNull();

    rerender(
      <RecordFlowContent
        {...baseProps({
          buffers: new Map([['src1', buffer({ status: 'reconnecting', records: [rec()] })]]),
        })}
      />
    );
    expect(screen.queryByText(/^connecting…$/i, { selector: 'p[role="status"]' })).toBeNull();
  });
});

describe('RecordFlowContent — table rows + View/Drawer', () => {
  it('renders one row per record with operation/key/position and a View button', () => {
    const records = [
      rec({ position: 'p1', operation: 'OPERATION_CREATE', key: { rawData: btoa('id-1') } }),
    ];
    render(
      <RecordFlowContent {...baseProps({ buffers: new Map([['src1', buffer({ records })]]) })} />
    );
    const row = screen.getAllByRole('row').find((r) => within(r).queryByText('OPERATION_CREATE'));
    expect(row).toBeTruthy();
    expect(row && within(row).getByText('id-1')).toBeTruthy();
    expect(row && within(row).getByRole('button', { name: 'View' })).toBeTruthy();
  });

  it('clicking View opens the Drawer for that record', () => {
    const records = [rec({ position: 'p1', key: { rawData: btoa('id-1') } })];
    render(
      <RecordFlowContent {...baseProps({ buffers: new Map([['src1', buffer({ records })]]) })} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(within(screen.getByRole('dialog')).getByText(/Record/)).toBeTruthy();
  });
});

describe('RecordFlowContent — filters', () => {
  const records = [
    rec({ position: 'p1', key: { rawData: btoa('alpha') }, metadata: {} }),
    rec({ position: 'p2', key: { rawData: btoa('beta') }, metadata: { 'conduit.error': 'boom' } }),
  ];

  it('key filter (prefix) narrows the visible rows', () => {
    render(
      <RecordFlowContent
        {...baseProps({
          buffers: new Map([['src1', buffer({ records })]]),
          keyFilter: 'alp',
          keyFilterMode: 'prefix',
        })}
      />
    );
    expect(screen.getByText('alpha')).toBeTruthy();
    expect(screen.queryByText('beta')).toBeNull();
  });

  it('errors-only filters to metadata-flagged records and has an honest empty state otherwise', () => {
    render(
      <RecordFlowContent
        {...baseProps({ buffers: new Map([['src1', buffer({ records })]]), errorsOnly: true })}
      />
    );
    expect(screen.getByText('beta')).toBeTruthy();
    expect(screen.queryByText('alpha')).toBeNull();
  });

  it('errors-only with no matches shows an honest empty state, not "no records at all"', () => {
    render(
      <RecordFlowContent
        {...baseProps({
          buffers: new Map([['src1', buffer({ records: [records[0] as SchemaV1Record] })]]),
          errorsOnly: true,
        })}
      />
    );
    expect(screen.getByText(/no error-flagged records observed yet/i)).toBeTruthy();
  });
});

describe('RecordFlowContent — drop-rate strip', () => {
  it('hidden when every rate is zero/undefined', () => {
    // Note: the sampling-honesty banner's own copy legitimately contains the
    // word "dropped" ("...may have been dropped under load..."), so this
    // asserts on the dedicated drop-rate strip container specifically, not on
    // text content anywhere in the page.
    const { container } = render(
      <RecordFlowContent {...baseProps({ dropRates: new Map([['src1', undefined]]) })} />
    );
    expect(container.querySelector('[class*="dropStrip"]')).toBeNull();
  });

  it('shown per component with "(in+out combined)" for a processor', () => {
    const stages = [
      stage('src1'),
      stage('p1:in', {
        id: 'p1:in',
        componentId: 'p1',
        inspectKind: 'processor-in',
        label: 'redact (in)',
      }),
    ];
    const { container } = render(
      <RecordFlowContent
        {...baseProps({
          stages,
          buffers: new Map([
            ['src1', buffer()],
            ['p1:in', buffer()],
          ]),
          dropRates: new Map([
            ['src1', 0],
            ['p1', 4.2],
          ]),
        })}
      />
    );
    const strip = container.querySelector('[class*="dropStrip"]');
    expect(strip).toBeTruthy();
    expect(strip?.textContent).toContain('in+out combined');
    expect(strip?.textContent).toContain('4.2');
  });
});

describe('RecordFlowContent — a11y', () => {
  it('has no axe violations', async () => {
    const records = [rec()];
    const { container } = render(
      <RecordFlowContent {...baseProps({ buffers: new Map([['src1', buffer({ records })]]) })} />
    );
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });

  it('uses a single aria-live region for mode transitions, not per-row', () => {
    const records = [rec(), rec({ position: 'p2' })];
    const { container } = render(
      <RecordFlowContent {...baseProps({ buffers: new Map([['src1', buffer({ records })]]) })} />
    );
    expect(container.querySelectorAll('[aria-live="polite"]').length).toBe(1);
  });
});

describe('RecordFlow — container smoke test', () => {
  class FakeWS {
    static instances: FakeWS[] = [];
    listeners: Record<string, Array<(ev: unknown) => void>> = {};
    constructor(public url: string) {
      FakeWS.instances.push(this);
    }
    addEventListener(type: string, cb: (ev: unknown) => void) {
      (this.listeners[type] ??= []).push(cb);
    }
    close() {
      /* no-op */
    }
  }

  function emptyModel(): TopologyModel {
    return {
      sources: [
        { id: 'src1', label: 'src1', plugin: 'builtin:src1', processors: [], unavailable: false },
      ],
      destinations: [],
      other: [],
      pipelineProcessors: [],
      orphanProcessors: [],
      isEmpty: false,
    };
  }

  afterEach(() => {
    FakeWS.instances = [];
  });

  it('renders end to end (real hooks) without crashing and opens a websocket for the primary stage', () => {
    vi.stubGlobal('WebSocket', FakeWS);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('') })
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <RecordFlow model={emptyModel()} pipelineName="my-pipeline" baseUrl="http://engine:8080" />
      </QueryClientProvider>
    );
    expect(screen.getByText(/live record flow/i)).toBeTruthy();
    expect(FakeWS.instances.length).toBe(1);
    expect(FakeWS.instances[0]?.url).toBe('ws://engine:8080/v1/connectors/src1/inspect');
    client.clear();
  });
});
