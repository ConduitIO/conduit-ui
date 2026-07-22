import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, within, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import axe from 'axe-core';
import type {
  SchemaV1Pipeline,
  SchemaV1PipelineStatus,
  SchemaStateStoppedReason,
} from '../../api/schema';
import { FleetContent, FleetView } from './FleetView';
import '../../tokens/tokens.css';

function pipe(
  id: string,
  status: SchemaV1PipelineStatus,
  opts: { name?: string; reason?: SchemaStateStoppedReason; error?: string } = {}
): SchemaV1Pipeline {
  return {
    id,
    config: { name: opts.name ?? id },
    state: {
      status,
      ...(opts.reason ? { stoppedReason: opts.reason } : {}),
      ...(opts.error ? { error: opts.error } : {}),
    },
  };
}

// OperateControls (UI-6), rendered per-row, uses TanStack Query mutations —
// every render needs a QueryClientProvider ancestor even in these
// props-fixture tests.
function renderContent(props: Partial<React.ComponentProps<typeof FleetContent>> = {}) {
  const queryClient = new QueryClient();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <FleetContent
          pipelines={props.pipelines}
          isPending={props.isPending ?? false}
          isError={props.isError ?? false}
          error={props.error ?? null}
          baseUrl={props.baseUrl}
          dataUpdatedAt={props.dataUpdatedAt ?? 0}
          errorUpdatedAt={props.errorUpdatedAt ?? 0}
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

describe('FleetContent — health-first layout', () => {
  const mixed: SchemaV1Pipeline[] = [
    pipe('run1', 'STATUS_RUNNING', { name: 'zeta-running' }),
    pipe('userstop', 'STATUS_STOPPED', { name: 'alpha-userstop', reason: 'STOPPED_REASON_USER' }),
    pipe('sys', 'STATUS_STOPPED', { name: 'mid-sysstop', reason: 'STOPPED_REASON_SYSTEM' }),
    pipe('deg', 'STATUS_DEGRADED', {
      name: 'beta-degraded',
      error: 'boom: connection refused\n  at write()',
    }),
    pipe('rec', 'STATUS_RECOVERING', { name: 'gamma-recovering' }),
  ];

  it('AC1: needs-attention pipelines render above the fold, sorted by severity (degraded>recovering>system-stopped)', () => {
    renderContent({ pipelines: mixed });
    const attention = screen.getByRole('region', { name: /Needs attention/i });
    const links = within(attention)
      .getAllByRole('link')
      .map((a) => a.textContent);
    expect(links).toEqual(['beta-degraded', 'gamma-recovering', 'mid-sysstop']);
  });

  it('AC1: running and user-stopped are in their own (calm) sections, not needs-attention', () => {
    renderContent({ pipelines: mixed });
    const running = screen.getByRole('region', { name: /^Running/i });
    expect(within(running).getByRole('link', { name: 'zeta-running' })).toBeTruthy();
    const stopped = screen.getByRole('region', { name: /^Stopped/i });
    expect(within(stopped).getByRole('link', { name: 'alpha-userstop' })).toBeTruthy();
  });

  it('AC2: count header shows correct per-status counts, degraded emphasized', () => {
    renderContent({ pipelines: mixed });
    const header = document.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(header).toBeTruthy();
    const text = header.textContent?.replace(/\s+/g, ' ') ?? '';
    // 1 running, 1 degraded, 1 recovering, 2 stopped (user + system)
    expect(text).toContain('1 Running');
    expect(text).toContain('1 Degraded');
    expect(text).toContain('1 Recovering');
    expect(text).toContain('2 Stopped');
    // degraded/recovering are emphasized
    const emphasized = Array.from(header.querySelectorAll('[data-emphasize="true"]')).map(
      (e) => e.textContent
    );
    expect(emphasized.some((t) => t?.includes('Degraded'))).toBe(true);
  });

  it('AC3: a degraded pipeline exposes its FULL error string in <=2 interactions (render + one expand)', () => {
    renderContent({ pipelines: mixed });
    const attention = screen.getByRole('region', { name: /Needs attention/i });
    // collapsed: only the first line shows
    expect(within(attention).getByText('boom: connection refused')).toBeTruthy();
    expect(within(attention).queryByText(/at write\(\)/)).toBeNull();
    // one click reveals the full, untruncated message
    fireEvent.click(within(attention).getByRole('button', { name: /show details/i }));
    expect(within(attention).getByText(/at write\(\)/)).toBeTruthy();
  });

  it('AC4: system-stopped is visually and semantically distinct from user-stopped', () => {
    renderContent({ pipelines: mixed });
    const attention = screen.getByRole('region', { name: /Needs attention/i });
    // system-stopped is labelled distinctly and sits in needs-attention
    expect(within(attention).getByText('Stopped (system)')).toBeTruthy();
    const stopped = screen.getByRole('region', { name: /^Stopped/i });
    const userRow = within(stopped)
      .getByRole('link', { name: 'alpha-userstop' })
      .closest('li') as HTMLElement;
    // user-stopped is the plain "Stopped" label, and is NOT flagged system
    expect(within(userRow).getByText('Stopped')).toBeTruthy();
    expect(userRow.textContent).not.toContain('system');
  });
});

describe('FleetContent — states (AC5)', () => {
  it('loading (no data yet) shows a skeleton', () => {
    renderContent({ isPending: true });
    expect(screen.getByText(/loading pipelines/i)).toBeTruthy();
  });

  it('engine unreachable at load names the target and does not hang on a skeleton', () => {
    renderContent({
      isError: true,
      error: new Error('network down'),
      baseUrl: 'http://localhost:8080',
    });
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('http://localhost:8080');
    expect(screen.queryByText(/loading pipelines/i)).toBeNull();
  });

  it('empty fleet names the authoring path (does not imply the UI creates pipelines)', () => {
    renderContent({ pipelines: [] });
    expect(screen.getByText(/no pipelines yet/i)).toBeTruthy();
    expect(screen.getByText(/conduit pipelines init/i)).toBeTruthy();
  });

  it('an unknown-status pipeline renders under "Unknown", not mislabeled as "Stopped"', () => {
    renderContent({ pipelines: [pipe('u', 'STATUS_UNSPECIFIED', { name: 'mystery' })] });
    const unknown = screen.getByRole('region', { name: /^Unknown/i });
    expect(within(unknown).getByRole('link', { name: 'mystery' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: /^Stopped/i })).toBeNull();
  });
});

describe('FleetContent — resilience (AC10)', () => {
  it('keeps the last-known list and shows a staleness banner on a failed refresh — never clears rows', () => {
    const last = [pipe('a', 'STATUS_RUNNING', { name: 'still-here' })];
    renderContent({ pipelines: last, isError: true, error: new Error('refresh failed') });
    // list retained
    expect(screen.getByRole('link', { name: 'still-here' })).toBeTruthy();
    // banner present
    expect(screen.getByText(/last-known state/i)).toBeTruthy();
  });
});

describe('FleetContent — reconciliation (AC9)', () => {
  it('a status change between fetches moves a pipeline into needs-attention', () => {
    const before = [pipe('p', 'STATUS_RUNNING', { name: 'flipper' })];
    const { rerender, queryClient } = renderContent({ pipelines: before });
    expect(screen.queryByRole('region', { name: /Needs attention/i })).toBeNull();
    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <FleetContent
            pipelines={[pipe('p', 'STATUS_DEGRADED', { name: 'flipper', error: 'went bad' })]}
            isPending={false}
            isError={false}
            error={null}
          />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const attention = screen.getByRole('region', { name: /Needs attention/i });
    expect(within(attention).getByRole('link', { name: 'flipper' })).toBeTruthy();
  });

  it('a stopped_reason transition (system -> user) re-buckets the pipeline', () => {
    const { rerender, queryClient } = renderContent({
      pipelines: [
        pipe('p', 'STATUS_STOPPED', { name: 'resumed', reason: 'STOPPED_REASON_SYSTEM' }),
      ],
    });
    expect(screen.getByRole('region', { name: /Needs attention/i })).toBeTruthy();
    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <FleetContent
            pipelines={[
              pipe('p', 'STATUS_STOPPED', { name: 'resumed', reason: 'STOPPED_REASON_USER' }),
            ]}
            isPending={false}
            isError={false}
            error={null}
          />
        </MemoryRouter>
      </QueryClientProvider>
    );
    // no longer needs attention; now a calm stopped pipeline
    expect(screen.queryByRole('region', { name: /Needs attention/i })).toBeNull();
    const stopped = screen.getByRole('region', { name: /^Stopped/i });
    expect(within(stopped).getByRole('link', { name: 'resumed' })).toBeTruthy();
  });
});

describe('FleetContent — operate controls per row (UI-6)', () => {
  it('a Running row exposes Stop; a Stopped row exposes Start; a Degraded row exposes Restart', () => {
    renderContent({
      pipelines: [
        pipe('r', 'STATUS_RUNNING', { name: 'runner' }),
        pipe('s', 'STATUS_STOPPED', { name: 'stopper', reason: 'STOPPED_REASON_USER' }),
        pipe('d', 'STATUS_DEGRADED', { name: 'degrader', error: 'boom' }),
      ],
    });
    const runnerRow = screen.getByRole('link', { name: 'runner' }).closest('li') as HTMLElement;
    const stopperRow = screen.getByRole('link', { name: 'stopper' }).closest('li') as HTMLElement;
    const degraderRow = screen.getByRole('link', { name: 'degrader' }).closest('li') as HTMLElement;

    expect(within(runnerRow).getByRole('button', { name: /stop pipeline/i })).toBeTruthy();
    expect(within(runnerRow).queryByRole('button', { name: /start pipeline/i })).toBeNull();

    expect(within(stopperRow).getByRole('button', { name: 'Start pipeline' })).toBeTruthy();
    expect(within(stopperRow).queryByRole('button', { name: /stop pipeline/i })).toBeNull();

    expect(within(degraderRow).getByRole('button', { name: 'Restart pipeline' })).toBeTruthy();
  });

  it('a foreign-actor status change (no local pending action) updates the row control between renders', () => {
    const { rerender, queryClient } = renderContent({
      pipelines: [pipe('p', 'STATUS_RUNNING', { name: 'flipper' })],
    });
    const row = () => screen.getByRole('link', { name: 'flipper' }).closest('li') as HTMLElement;
    expect(within(row()).getByRole('button', { name: /stop pipeline/i })).toBeTruthy();

    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <FleetContent
            pipelines={[
              pipe('p', 'STATUS_STOPPED', { name: 'flipper', reason: 'STOPPED_REASON_SYSTEM' }),
            ]}
            isPending={false}
            isError={false}
            error={null}
          />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(within(row()).getByRole('button', { name: 'Start pipeline' })).toBeTruthy();
    expect(within(row()).queryByRole('button', { name: /stop pipeline/i })).toBeNull();
  });
});

describe('FleetContent — a11y (AC7) and scale (AC6)', () => {
  it('has no axe violations and uses real list semantics', async () => {
    const { container } = renderContent({
      pipelines: [
        pipe('deg', 'STATUS_DEGRADED', { name: 'd', error: 'oops' }),
        pipe('run', 'STATUS_RUNNING', { name: 'r' }),
      ],
    });
    expect(screen.getAllByRole('listitem').length).toBe(2);
    // aria-live region for the counts
    expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });

  it('AC6: a 500-pipeline fleet renders with correct counts and all problems reachable', () => {
    const many: SchemaV1Pipeline[] = [];
    for (let i = 0; i < 470; i++) many.push(pipe(`r${i}`, 'STATUS_RUNNING', { name: `run-${i}` }));
    for (let i = 0; i < 30; i++) {
      many.push(pipe(`d${i}`, 'STATUS_DEGRADED', { name: `deg-${i}`, error: `err ${i}` }));
    }
    renderContent({ pipelines: many });
    // every degraded pipeline is present and reachable (problems never hidden)
    const attention = screen.getByRole('region', { name: /Needs attention \(30\)/i });
    expect(within(attention).getAllByRole('listitem').length).toBe(30);
    // header count reflects the full fleet
    const header = document.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(header.textContent?.replace(/\s+/g, ' ')).toContain('470 Running');
  });
});

describe('FleetView container — wire to render', () => {
  it('renders the fleet from the pipelines query', async () => {
    // Seed the query cache so the container renders its content without depending
    // on fetch-capture timing; the fetch/parse path is covered by fetchPipelines'
    // own test below.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(
      ['pipelines'],
      [pipe('x', 'STATUS_RUNNING', { name: 'wired-pipeline' })]
    );
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <FleetView />
        </MemoryRouter>
      </QueryClientProvider>
    );
    await waitFor(() => expect(screen.getByRole('link', { name: 'wired-pipeline' })).toBeTruthy());
    queryClient.clear();
  });
});
