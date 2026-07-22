import { describe, it, expect } from 'vitest';
import { parseMetricsText } from './metrics';
import { extractPipelineMetrics } from './pipelineMetrics';

// Prometheus text for one destination series (pipeline "p1", plugin "s3") with a
// given acked-record count, byte sum, and duration-histogram bucket counts.
// Buckets are cumulative, matching real exposition semantics.
function destText(opts: {
  count: number;
  sum: number;
  buckets: Array<[string, number]>; // [le, cumulativeCount]
  componentId?: string;
}): string {
  const extra = opts.componentId ? `,component_id="${opts.componentId}"` : '';
  const lines = [
    `conduit_connector_bytes_count{pipeline_name="p1",plugin="s3",type="destination"${extra}} ${opts.count}`,
    `conduit_connector_bytes_sum{pipeline_name="p1",plugin="s3",type="destination"${extra}} ${opts.sum}`,
  ];
  for (const [le, c] of opts.buckets) {
    lines.push(
      `conduit_connector_execution_duration_seconds_bucket{pipeline_name="p1",plugin="s3",type="destination"${extra},le="${le}"} ${c}`
    );
  }
  return lines.join('\n') + '\n';
}

describe('extractPipelineMetrics — rate derivation', () => {
  it('reports undefined (not 0) on the first poll — nothing to derive a rate from yet', () => {
    const parsed = parseMetricsText(destText({ count: 10, sum: 1000, buckets: [] }));
    const { snapshot } = extractPipelineMetrics(parsed, 'p1', 1000, undefined);
    expect(snapshot.connectorRates).toHaveLength(1);
    expect(snapshot.connectorRates[0]?.recordsPerSec).toBeUndefined();
    expect(snapshot.connectorRates[0]?.bytesPerSec).toBeUndefined();
  });

  it('derives records/sec and bytes/sec from two consecutive polls over the actual elapsed time', () => {
    const p1 = parseMetricsText(destText({ count: 10, sum: 1000, buckets: [] }));
    const first = extractPipelineMetrics(p1, 'p1', 0, undefined);

    // 5s elapsed (not the nominal 5000ms poll interval — this proves elapsed is
    // computed from the actual timestamps, i.e. survives a scrape gap).
    const p2 = parseMetricsText(destText({ count: 60, sum: 6000, buckets: [] }));
    const second = extractPipelineMetrics(p2, 'p1', 5000, first.raw);

    expect(second.snapshot.connectorRates[0]?.recordsPerSec).toBeCloseTo((60 - 10) / 5, 5);
    expect(second.snapshot.connectorRates[0]?.bytesPerSec).toBeCloseTo((6000 - 1000) / 5, 5);
  });

  it('honors an actual scrape gap larger than the nominal interval', () => {
    const p1 = parseMetricsText(destText({ count: 0, sum: 0, buckets: [] }));
    const first = extractPipelineMetrics(p1, 'p1', 0, undefined);

    // 20s elapsed instead of a nominal 5s poll — a delayed/stalled tab, a slow
    // engine, etc. The rate must divide by the REAL 20s, not an assumed 5s.
    const p2 = parseMetricsText(destText({ count: 100, sum: 0, buckets: [] }));
    const second = extractPipelineMetrics(p2, 'p1', 20_000, first.raw);

    expect(second.snapshot.connectorRates[0]?.recordsPerSec).toBeCloseTo(100 / 20, 5);
  });

  it('counter reset (process restart): curr < prev -> undefined rate, never negative, and re-baselines', () => {
    const p1 = parseMetricsText(destText({ count: 1000, sum: 100_000, buckets: [] }));
    const first = extractPipelineMetrics(p1, 'p1', 0, undefined);

    // Counters dropped below their previous value — a restart, not a real decrease.
    const p2 = parseMetricsText(destText({ count: 5, sum: 500, buckets: [] }));
    const second = extractPipelineMetrics(p2, 'p1', 5000, first.raw);
    expect(second.snapshot.connectorRates[0]?.recordsPerSec).toBeUndefined();
    expect(second.snapshot.connectorRates[0]?.bytesPerSec).toBeUndefined();

    // Next poll re-baselines from the post-reset counters — a normal-looking
    // increase from here on should produce a normal (non-undefined) rate.
    const p3 = parseMetricsText(destText({ count: 55, sum: 5500, buckets: [] }));
    const third = extractPipelineMetrics(p3, 'p1', 10_000, second.raw);
    expect(third.snapshot.connectorRates[0]?.recordsPerSec).toBeCloseTo((55 - 5) / 5, 5);
  });

  it('a metric absent from the wire produces undefined fields, never 0', () => {
    // No conduit_connector_bytes samples at all for this pipeline.
    const parsed = parseMetricsText('conduit_unrelated_metric 1\n');
    const { snapshot } = extractPipelineMetrics(parsed, 'p1', 0, undefined);
    expect(snapshot.connectorRates).toEqual([]);
  });

  it('p95 latency is undefined until a second poll exists', () => {
    const parsed = parseMetricsText(
      destText({
        count: 10,
        sum: 1000,
        buckets: [
          ['0.1', 8],
          ['1', 10],
          ['+Inf', 10],
        ],
      })
    );
    const { snapshot } = extractPipelineMetrics(parsed, 'p1', 0, undefined);
    expect(snapshot.connectorRates[0]?.p95LatencySeconds).toBeUndefined();
  });

  it('p95 interpolates within the bucket where the delta crosses the 95th percentile', () => {
    const p1 = parseMetricsText(
      destText({
        count: 0,
        sum: 0,
        buckets: [
          ['0.1', 0],
          ['1', 0],
          ['+Inf', 0],
        ],
      })
    );
    const first = extractPipelineMetrics(p1, 'p1', 0, undefined);

    // Window: 100 observations, 90 at/under 0.1s, 10 more between 0.1s and 1s (so
    // cumulative at 1s = 100). p95 (95th of 100) falls partway through the
    // (0.1, 1] bucket: 5 of the 10 in that bucket needed -> halfway -> ~0.55.
    const p2 = parseMetricsText(
      destText({
        count: 100,
        sum: 0,
        buckets: [
          ['0.1', 90],
          ['1', 100],
          ['+Inf', 100],
        ],
      })
    );
    const second = extractPipelineMetrics(p2, 'p1', 5000, first.raw);
    expect(second.snapshot.connectorRates[0]?.p95LatencySeconds).toBeCloseTo(0.55, 5);
  });

  it('p95 falls back to the last finite boundary when the target lands in the +Inf overflow bucket', () => {
    const p1 = parseMetricsText(
      destText({
        count: 0,
        sum: 0,
        buckets: [
          ['1', 0],
          ['+Inf', 0],
        ],
      })
    );
    const first = extractPipelineMetrics(p1, 'p1', 0, undefined);

    // All 100 observations land beyond the last finite boundary (1s).
    const p2 = parseMetricsText(
      destText({
        count: 100,
        sum: 0,
        buckets: [
          ['1', 0],
          ['+Inf', 100],
        ],
      })
    );
    const second = extractPipelineMetrics(p2, 'p1', 5000, first.raw);
    expect(second.snapshot.connectorRates[0]?.p95LatencySeconds).toBe(1);
  });

  it('a bucket-count decrease (histogram reset) yields undefined p95 without throwing', () => {
    const p1 = parseMetricsText(
      destText({
        count: 100,
        sum: 0,
        buckets: [
          ['1', 100],
          ['+Inf', 100],
        ],
      })
    );
    const first = extractPipelineMetrics(p1, 'p1', 0, undefined);

    const p2 = parseMetricsText(
      destText({
        count: 5,
        sum: 0,
        buckets: [
          ['1', 5],
          ['+Inf', 5],
        ],
      })
    );
    const second = extractPipelineMetrics(p2, 'p1', 5000, first.raw);
    expect(second.snapshot.connectorRates[0]?.p95LatencySeconds).toBeUndefined();
  });

  it('component_id present -> hasComponentId true and componentId carried on the rate', () => {
    const parsed = parseMetricsText(
      destText({ count: 1, sum: 1, buckets: [], componentId: 'conn-1' })
    );
    const { snapshot } = extractPipelineMetrics(parsed, 'p1', 0, undefined);
    expect(snapshot.hasComponentId).toBe(true);
    expect(snapshot.connectorRates[0]?.componentId).toBe('conn-1');
  });

  it('component_id absent -> hasComponentId false and componentId undefined on the rate', () => {
    const parsed = parseMetricsText(destText({ count: 1, sum: 1, buckets: [] }));
    const { snapshot } = extractPipelineMetrics(parsed, 'p1', 0, undefined);
    expect(snapshot.hasComponentId).toBe(false);
    expect(snapshot.connectorRates[0]?.componentId).toBeUndefined();
  });

  it('a non-positive elapsed time (near-simultaneous refetch / clock skew) yields undefined rather than a divide-by-zero', () => {
    const p1 = parseMetricsText(destText({ count: 10, sum: 100, buckets: [] }));
    const first = extractPipelineMetrics(p1, 'p1', 1000, undefined);
    const p2 = parseMetricsText(destText({ count: 20, sum: 200, buckets: [] }));
    const second = extractPipelineMetrics(p2, 'p1', 1000, first.raw); // same timestamp
    expect(second.snapshot.connectorRates[0]?.recordsPerSec).toBeUndefined();
    expect(second.snapshot.connectorRates[0]?.bytesPerSec).toBeUndefined();
  });
});
