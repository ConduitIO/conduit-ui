import { useRef } from 'react';
import { useQuery, type QueryFunctionContext, type UseQueryResult } from '@tanstack/react-query';
import { fetchMetrics, samplesMatching, type ParsedMetrics } from './metrics';

// Poll interval for pipeline metrics. Slower than pipelines.ts's POLL_INTERVAL_MS
// (3s) because metrics here are cosmetic-lag-tolerant, never a correctness signal
// (UI-5 plan §3): staleness produces a stale badge, not a wrong "is it running"
// answer — that answer still comes from the 3s pipeline/topology polls.
export const METRICS_POLL_INTERVAL_MS = 5000;

export type ConnectorPluginType = 'source' | 'destination';

/**
 * Per-connector-series throughput/latency, derived from two consecutive polls of
 * `conduit_connector_bytes` and `conduit_connector_execution_duration_seconds`.
 *
 * `componentId` present (P7: a `component_id` label on those metrics, matching
 * connector/processor instance IDs 1:1 with topology node IDs) means this rate
 * belongs to exactly one connector, unambiguously — including fan-in/fan-out.
 * `componentId` absent (older engine, or P7 not deployed yet) means the wire only
 * offers `(pipeline_name, plugin, type)`, so this rate is already a Prometheus-
 * side sum across every connector sharing that tuple in the pipeline;
 * `nodeMetrics.ts` decides whether that's still safe to attribute to a single
 * topology node.
 */
export interface ConnectorRate {
  plugin: string;
  pluginType: ConnectorPluginType;
  componentId: string | undefined;
  /** undefined until two polls exist for this series, or after a detected counter reset — NEVER 0 as a stand-in for "no data" (0 would falsely claim "measured and stopped"). */
  recordsPerSec: number | undefined;
  bytesPerSec: number | undefined;
  /**
   * Approximate p95 latency over the last poll window, via linear interpolation
   * over the histogram's cumulative bucket deltas. Approximate by design (bucket
   * boundaries, not exact order statistics) — good enough for a "slow" threshold,
   * never presented as a precise SLO number. `undefined` when this series has no
   * duration samples at all (today, `conduit_connector_execution_duration_seconds`
   * is only emitted for destinations — see measure.go / service.go — so source
   * rates always report `undefined` here, which is honest: there is no read-
   * latency signal on the wire for sources today, not "0 latency").
   */
  p95LatencySeconds: number | undefined;
}

export interface PipelineMetricsSnapshot {
  connectorRates: ConnectorRate[];
  /**
   * True when at least one sample for this pipeline carried a `component_id`
   * label this poll. Lets consumers show "per-node" vs. "combined" copy without
   * re-deriving the same detection themselves.
   */
  hasComponentId: boolean;
  observedAt: number;
}

interface RawBucket {
  /** Bucket boundary; `Infinity` for the `+Inf` overflow bucket. */
  le: number;
  cumulativeCount: number;
}

interface RawSeries {
  plugin: string;
  pluginType: ConnectorPluginType;
  componentId: string | undefined;
  /** conduit_connector_bytes_count — acked records for this series. */
  count: number;
  /** conduit_connector_bytes_sum — bytes for this series. */
  sum: number;
  /** conduit_connector_execution_duration_seconds_bucket, sorted ascending by `le`; empty if the metric has no sample for this series. */
  buckets: RawBucket[];
}

/**
 * Opaque carry-over state between polls (the previous poll's raw counters/
 * buckets). Callers just thread whatever `extractPipelineMetrics` last returned
 * back in as `prev` — see usePipelineMetrics below and pipelineMetrics.test.ts.
 */
export interface RawSnapshot {
  t: number;
  series: Map<string, RawSeries>;
}

function isConnectorPluginType(v: string | undefined): v is ConnectorPluginType {
  return v === 'source' || v === 'destination';
}

// component_id alone is a stable, globally unique key once present (two distinct
// connector instances never share an ID); without it, (pluginType, plugin) is the
// finest-grained key the wire offers — it's exactly the tuple Prometheus already
// aggregates conduit_connector_bytes by server-side, so it doubles as the
// fallback-attribution grouping key in nodeMetrics.ts.
function seriesKey(
  pluginType: ConnectorPluginType,
  plugin: string,
  componentId: string | undefined
): string {
  return componentId !== undefined ? `id:${componentId}` : `${pluginType}:${plugin}`;
}

function parseLe(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  if (raw === '+Inf') return Infinity;
  if (raw === '-Inf') return -Infinity;
  const n = Number(raw);
  return Number.isNaN(n) ? undefined : n;
}

function buildRawSnapshot(parsed: ParsedMetrics, pipelineName: string, t: number): RawSnapshot {
  const series = new Map<string, RawSeries>();

  function getOrCreate(
    pluginType: ConnectorPluginType,
    plugin: string,
    componentId: string | undefined
  ): RawSeries {
    const key = seriesKey(pluginType, plugin, componentId);
    let s = series.get(key);
    if (!s) {
      s = { plugin, pluginType, componentId, count: 0, sum: 0, buckets: [] };
      series.set(key, s);
    }
    return s;
  }

  for (const smp of samplesMatching(parsed, 'conduit_connector_bytes_count', {
    pipeline_name: pipelineName,
  })) {
    const { type, plugin, component_id: componentId } = smp.labels;
    if (!isConnectorPluginType(type) || !plugin) continue;
    getOrCreate(type, plugin, componentId).count = smp.value;
  }
  for (const smp of samplesMatching(parsed, 'conduit_connector_bytes_sum', {
    pipeline_name: pipelineName,
  })) {
    const { type, plugin, component_id: componentId } = smp.labels;
    if (!isConnectorPluginType(type) || !plugin) continue;
    getOrCreate(type, plugin, componentId).sum = smp.value;
  }
  for (const smp of samplesMatching(parsed, 'conduit_connector_execution_duration_seconds_bucket', {
    pipeline_name: pipelineName,
  })) {
    const { type, plugin, component_id: componentId, le: leRaw } = smp.labels;
    if (!isConnectorPluginType(type) || !plugin) continue;
    const le = parseLe(leRaw);
    if (le === undefined) continue;
    getOrCreate(type, plugin, componentId).buckets.push({ le, cumulativeCount: smp.value });
  }
  for (const s of series.values()) s.buckets.sort((a, b) => a.le - b.le);

  return { t, series };
}

/**
 * p95 estimate from the delta between two cumulative-bucket snapshots (i.e. only
 * observations within this poll window, not since process start — an "elevated
 * latency right now" signal rather than a slow-moving all-time average).
 *
 * A decrease in any bucket's cumulative count between polls means the histogram
 * itself was reset (process restart) — returns `undefined` rather than a bogus or
 * negative interpolation; the next poll re-baselines automatically.
 */
function computeP95FromBucketDelta(
  prevBuckets: RawBucket[],
  currBuckets: RawBucket[]
): number | undefined {
  if (currBuckets.length === 0) return undefined; // no duration samples for this series at all

  const prevByLe = new Map(prevBuckets.map((b) => [b.le, b.cumulativeCount]));

  const deltas: Array<{ le: number; delta: number }> = [];
  for (const b of currBuckets) {
    const prevCount = prevByLe.get(b.le) ?? 0;
    const delta = b.cumulativeCount - prevCount;
    if (delta < 0) return undefined; // reset
    deltas.push({ le: b.le, delta });
  }

  const total = deltas[deltas.length - 1]?.delta ?? 0; // last (highest le) bucket = window total
  if (total <= 0) return undefined; // no observations this window — not "0 latency"

  const target = total * 0.95;
  let lowerLe = 0;
  let lowerCumulative = 0;
  for (const { le, delta } of deltas) {
    if (delta >= target) {
      if (!Number.isFinite(le)) {
        // p95 falls in the +Inf overflow bucket — no upper bound to interpolate
        // against. Report the last finite boundary as a conservative
        // (under-)estimate rather than inventing a number.
        return lowerLe;
      }
      if (delta === lowerCumulative) return le; // degenerate: jumps straight to target
      const frac = (target - lowerCumulative) / (delta - lowerCumulative);
      return lowerLe + frac * (le - lowerLe);
    }
    lowerLe = le;
    lowerCumulative = delta;
  }
  return undefined; // unreachable given total > 0 and cumulative buckets, but keeps control flow total
}

function deriveRate(
  prev: RawSeries | undefined,
  curr: RawSeries,
  elapsedSec: number
): Pick<ConnectorRate, 'recordsPerSec' | 'bytesPerSec' | 'p95LatencySeconds'> {
  const p95LatencySeconds = prev
    ? computeP95FromBucketDelta(prev.buckets, curr.buckets)
    : undefined;

  if (!prev || elapsedSec <= 0) {
    // First poll for this series, or a non-positive scrape gap (clock skew /
    // near-simultaneous refetch) — nothing to divide by, report unknown rather
    // than a divide-by-zero or a misleadingly precise number.
    return { recordsPerSec: undefined, bytesPerSec: undefined, p95LatencySeconds };
  }

  // Counter reset (process restart zeroed the counters) — discard this interval
  // rather than report a negative or bogus rate; curr becomes the new baseline so
  // the next poll re-derives cleanly from here.
  const reset = curr.count < prev.count || curr.sum < prev.sum;
  const recordsPerSec = reset ? undefined : (curr.count - prev.count) / elapsedSec;
  const bytesPerSec = reset ? undefined : (curr.sum - prev.sum) / elapsedSec;
  return { recordsPerSec, bytesPerSec, p95LatencySeconds };
}

function deriveSnapshot(prev: RawSnapshot | undefined, curr: RawSnapshot): PipelineMetricsSnapshot {
  const elapsedSec = prev ? (curr.t - prev.t) / 1000 : 0;
  const connectorRates: ConnectorRate[] = [];
  let hasComponentId = false;

  for (const s of curr.series.values()) {
    if (s.componentId !== undefined) hasComponentId = true;
    const key = seriesKey(s.pluginType, s.plugin, s.componentId);
    const p = prev?.series.get(key);
    const rate = deriveRate(p, s, elapsedSec);
    connectorRates.push({
      plugin: s.plugin,
      pluginType: s.pluginType,
      componentId: s.componentId,
      ...rate,
    });
  }

  return { connectorRates, hasComponentId, observedAt: curr.t };
}

/**
 * Pure extraction + rate derivation for one poll, exported (in addition to the
 * hook below) so the rate math — counter-reset handling, scrape-gap-aware
 * elapsed time, p95 bucket interpolation — is directly unit-testable without a
 * real network fetch or TanStack's `AbortSignal` (which native `fetch` in this
 * test environment rejects across the jsdom/undici realm boundary — see
 * pipelines.test.ts's equivalent note).
 *
 * `now` is injected (rather than read via `Date.now()` internally) so tests can
 * control the elapsed time between polls precisely, including the "near-
 * simultaneous refetch" (non-positive elapsed) edge case.
 */
export function extractPipelineMetrics(
  parsed: ParsedMetrics,
  pipelineName: string,
  now: number,
  prev: RawSnapshot | undefined
): { snapshot: PipelineMetricsSnapshot; raw: RawSnapshot } {
  const raw = buildRawSnapshot(parsed, pipelineName, now);
  const snapshot = deriveSnapshot(prev, raw);
  return { snapshot, raw };
}

// Don't retry indefinitely against a down engine; back off instead of hammering
// every poll tick. Metrics failure must never blank the topology view — the
// consumer (PipelineDetail) keeps rendering identity-only nodes on error, same
// contract as pipelineDetail.ts's processorsUnavailable handling.
const retry = 2;
const retryDelay = (attempt: number) => Math.min(1000 * 2 ** attempt, 15_000);

/**
 * Polls `/metrics`, extracts this pipeline's connector series, and derives
 * per-series rates from consecutive polls. `pipelineName` is `pipeline.config.name`
 * (the wire's `pipeline_name` label is the display name, not the pipeline ID —
 * see measure.go) — a rename or a delete-recreate-under-the-same-name race can
 * therefore misattribute a poll's numbers for one interval. Metrics are advisory/
 * cosmetic (never a correctness signal), so this is an accepted, documented risk
 * rather than something this hook guards against; `usePipelineDetail`'s own
 * ID-keyed cache remains the source of truth for pipeline identity.
 *
 * The previous poll's raw counters live in a `useRef` scoped to this hook
 * instance — they reset on unmount/remount (navigating away and back), which is
 * fine: metrics are cosmetic-lag-tolerant, so re-warming for one extra poll after
 * a remount costs nothing correctness-wise.
 */
export function usePipelineMetrics(
  pipelineName: string,
  baseUrl = ''
): UseQueryResult<PipelineMetricsSnapshot, Error> {
  const prevRef = useRef<RawSnapshot | undefined>(undefined);

  return useQuery<PipelineMetricsSnapshot, Error>({
    queryKey: ['pipeline-metrics', pipelineName, baseUrl] as const,
    queryFn: async ({ signal }: QueryFunctionContext) => {
      const parsed = await fetchMetrics(baseUrl, signal);
      const { snapshot, raw } = extractPipelineMetrics(
        parsed,
        pipelineName,
        Date.now(),
        prevRef.current
      );
      prevRef.current = raw; // re-baseline for the next poll, including after a detected reset
      return snapshot;
    },
    refetchInterval: METRICS_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry,
    retryDelay,
  });
}
