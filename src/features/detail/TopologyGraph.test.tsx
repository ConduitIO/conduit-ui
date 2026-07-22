import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import axe from 'axe-core';
import type { TopologyModel } from './topology';
import type { NodeMetricView } from './nodeMetrics';
import { TopologyGraph } from './TopologyGraph';
import '../../tokens/tokens.css';

function model(over: Partial<TopologyModel> = {}): TopologyModel {
  return {
    sources: [{ id: 's1', label: 's1', plugin: 'file', processors: [], unavailable: false }],
    destinations: [{ id: 'd1', label: 'd1', plugin: 's3', processors: [], unavailable: false }],
    other: [],
    pipelineProcessors: [],
    orphanProcessors: [],
    isEmpty: false,
    ...over,
  };
}

function view(over: Partial<NodeMetricView> = {}): NodeMetricView {
  return {
    recordsPerSec: undefined,
    bytesPerSec: undefined,
    p95LatencySeconds: undefined,
    activity: 'unknown',
    slow: false,
    ambiguous: false,
    combinedAcrossCount: undefined,
    ...over,
  };
}

afterEach(cleanup);

describe('TopologyGraph — UI-5 node metric badges', () => {
  it('renders records/sec and bytes/sec for a flowing node', () => {
    const nodeMetrics = new Map([
      ['s1', view({ activity: 'flowing', recordsPerSec: 12, bytesPerSec: 2048 })],
    ]);
    render(<TopologyGraph model={model()} pipelineName="p1" nodeMetrics={nodeMetrics} />);
    expect(screen.getByText(/12 rec\/s/)).toBeTruthy();
    expect(screen.getByText(/2\.0 KB\/s/)).toBeTruthy();
  });

  it('renders the neutral idle label, never "stalled"', () => {
    const nodeMetrics = new Map([['s1', view({ activity: 'idle' })]]);
    render(<TopologyGraph model={model()} pipelineName="p1" nodeMetrics={nodeMetrics} />);
    expect(screen.getByText(/idle — no recent activity/i)).toBeTruthy();
    expect(screen.queryByText(/stalled/i)).toBeNull();
  });

  it('renders a "slow" tag when p95 crosses the threshold', () => {
    const nodeMetrics = new Map([
      ['d1', view({ activity: 'flowing', recordsPerSec: 1, slow: true })],
    ]);
    render(<TopologyGraph model={model()} pipelineName="p1" nodeMetrics={nodeMetrics} />);
    expect(screen.getByText('slow')).toBeTruthy();
  });

  it('renders "combined across N" for an ambiguous fallback-attributed node', () => {
    const nodeMetrics = new Map([
      [
        's1',
        view({ activity: 'flowing', recordsPerSec: 4, ambiguous: true, combinedAcrossCount: 3 }),
      ],
    ]);
    render(<TopologyGraph model={model()} pipelineName="p1" nodeMetrics={nodeMetrics} />);
    expect(screen.getByText(/combined across 3/i)).toBeTruthy();
  });

  it('renders no badge for a node absent from nodeMetrics (e.g. not Running, or an "other"-typed connector)', () => {
    render(<TopologyGraph model={model()} pipelineName="p1" />);
    expect(screen.queryByText(/rec\/s/)).toBeNull();
    expect(screen.queryByText(/idle/i)).toBeNull();
  });

  it('renders no badge for a node whose view is "unknown" and not ambiguous', () => {
    const nodeMetrics = new Map([['s1', view()]]); // default: unknown, not ambiguous
    render(<TopologyGraph model={model()} pipelineName="p1" nodeMetrics={nodeMetrics} />);
    expect(screen.queryByText(/rec\/s/)).toBeNull();
  });

  it('appends an overall-activity sentence to the screen-reader summary, not a per-node aria-live spam', () => {
    render(
      <TopologyGraph
        model={model()}
        pipelineName="p1"
        activitySummary={{
          activity: 'flowing',
          slow: true,
          recordsPerSec: 5,
          ambiguousDestinationCount: undefined,
        }}
      />
    );
    const graph = screen.getByRole('region', { name: /topology/i });
    expect(graph.textContent).toMatch(/pipeline is currently flowing/i);
    expect(graph.textContent).toMatch(/elevated write latency/i);
  });

  it('omits the overall-activity sentence when activity is unknown', () => {
    render(
      <TopologyGraph
        model={model()}
        pipelineName="p1"
        activitySummary={{
          activity: 'unknown',
          slow: false,
          recordsPerSec: undefined,
          ambiguousDestinationCount: undefined,
        }}
      />
    );
    const graph = screen.getByRole('region', { name: /topology/i });
    expect(graph.textContent).not.toMatch(/pipeline is currently/i);
  });

  it('AC6 (extended): axe clean with node metric badges present', async () => {
    const nodeMetrics = new Map([
      [
        's1',
        view({ activity: 'flowing', recordsPerSec: 4, ambiguous: true, combinedAcrossCount: 2 }),
      ],
      ['d1', view({ activity: 'idle', slow: true })],
    ]);
    const { container } = render(
      <TopologyGraph model={model()} pipelineName="p1" nodeMetrics={nodeMetrics} />
    );
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
