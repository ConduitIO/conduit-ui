import type { TopologyModel, TopologyConnectorNode } from './topology';
import type {
  ConnectorPluginType,
  ConnectorRate,
  PipelineMetricsSnapshot,
} from '../../api/pipelineMetrics';

// Attribution + classification (UI-5): turns a poll's connector rates into a
// per-topology-node view, pure and DOM-free (same split as topology.ts) so the
// attribution logic — the part with real edge cases (fan-in/fan-out, missing
// data, counter resets already handled upstream) — is unit-testable without
// React.
//
// p95 write/read latency above this is flagged "slow" — the one backpressure-ish
// signal the wire actually offers (no in-flight/queue-depth gauge exists; see the
// UI-5 plan's scope decision). Approximate (bucket-delta interpolation in
// pipelineMetrics.ts), so this is a coarse threshold, not an SLO gate.
export const SLOW_LATENCY_THRESHOLD_SECONDS = 1;

export type NodeActivity = 'flowing' | 'idle' | 'unknown';

export interface NodeMetricView {
  recordsPerSec: number | undefined;
  bytesPerSec: number | undefined;
  p95LatencySeconds: number | undefined;
  activity: NodeActivity;
  slow: boolean;
  /**
   * True when this node's numbers are NOT attributed uniquely to it: the wire had
   * no `component_id` (older engine, or P7 not yet deployed) AND more than one
   * topology node shares this node's (plugin, type), so Prometheus already summed
   * them server-side. `combinedAcrossCount` says how many nodes share the number.
   * Never silently picks one node to "own" a combined number — see the plan's
   * §3 nodeMetrics.ts note.
   */
  ambiguous: boolean;
  combinedAcrossCount: number | undefined;
}

function classify(
  recordsPerSec: number | undefined,
  p95: number | undefined
): { activity: NodeActivity; slow: boolean } {
  const activity: NodeActivity =
    recordsPerSec === undefined ? 'unknown' : recordsPerSec > 0 ? 'flowing' : 'idle';
  const slow = p95 !== undefined && p95 > SLOW_LATENCY_THRESHOLD_SECONDS;
  return { activity, slow };
}

function unknownView(): NodeMetricView {
  return {
    recordsPerSec: undefined,
    bytesPerSec: undefined,
    p95LatencySeconds: undefined,
    activity: 'unknown',
    slow: false,
    ambiguous: false,
    combinedAcrossCount: undefined,
  };
}

function viewFromRate(
  rate: ConnectorRate,
  ambiguous: boolean,
  combinedAcrossCount: number | undefined
): NodeMetricView {
  const { activity, slow } = classify(rate.recordsPerSec, rate.p95LatencySeconds);
  return {
    recordsPerSec: rate.recordsPerSec,
    bytesPerSec: rate.bytesPerSec,
    p95LatencySeconds: rate.p95LatencySeconds,
    activity,
    slow,
    ambiguous,
    combinedAcrossCount,
  };
}

function groupByPluginType(
  nodes: readonly TopologyConnectorNode[],
  pluginType: ConnectorPluginType
): Map<string, TopologyConnectorNode[]> {
  const groups = new Map<string, TopologyConnectorNode[]>();
  for (const n of nodes) {
    const key = `${pluginType}:${n.plugin ?? ''}`;
    const list = groups.get(key);
    if (list) list.push(n);
    else groups.set(key, [n]);
  }
  return groups;
}

/**
 * Attributes a metrics poll onto topology node ids.
 *
 * Primary path (P7): a rate carrying `componentId` matches a node's id directly —
 * unambiguous regardless of fan-in/fan-out, because each connector instance emits
 * its own series.
 *
 * Fallback path (no `component_id` on any sample — older engine, or P7 not yet
 * deployed): a rate is keyed only by (plugin, pluginType), exactly how Prometheus
 * already aggregated it server-side. If exactly one topology node shares that
 * (plugin, pluginType), attribution is still unambiguous. If more than one node
 * shares it, the number is inherently a sum across all of them — every one of
 * those nodes is marked `ambiguous` with the same shared, combined rate, rather
 * than guessing which node "owns" it.
 *
 * Only `sources` and `destinations` are attributed — `other` (unspecified-type)
 * connectors have no (plugin, type) counterpart in the metric labels, so they are
 * intentionally left out of the returned map (no badge, not a wrong badge).
 */
export function attributeToNodes(
  model: TopologyModel,
  snapshot: PipelineMetricsSnapshot | undefined
): Map<string, NodeMetricView> {
  const result = new Map<string, NodeMetricView>();
  if (!snapshot) return result;

  const byComponentId = new Map<string, ConnectorRate>();
  const byPluginType = new Map<string, ConnectorRate[]>();
  for (const rate of snapshot.connectorRates) {
    if (rate.componentId !== undefined) {
      byComponentId.set(rate.componentId, rate);
      continue;
    }
    const key = `${rate.pluginType}:${rate.plugin}`;
    const list = byPluginType.get(key);
    if (list) list.push(rate);
    else byPluginType.set(key, [rate]);
  }

  function attributeGroup(
    nodes: readonly TopologyConnectorNode[],
    pluginType: ConnectorPluginType
  ) {
    const groups = groupByPluginType(nodes, pluginType);
    for (const [key, siblings] of groups) {
      // Server-side aggregation means at most one fallback rate per (plugin,
      // type) group is expected. If the wire ever has more than one (a malformed
      // or duplicate scrape), this conservatively takes the first rather than
      // attempting to merge or pick a "correct" one — a defensive fallback for a
      // case that should not occur, not the expected path.
      const fallbackRate = byPluginType.get(key)?.[0];
      // The count that matters for "combined across N" is how many of THESE
      // siblings actually share the fallback number — not every node with this
      // (plugin, type), since some may already have their own direct
      // component_id match (mixed direct/fallback isn't expected on a uniform
      // engine, but the count would otherwise overstate the ambiguity if it
      // ever happened).
      const fallbackSiblings = siblings.filter((n) => !byComponentId.has(n.id));

      for (const node of siblings) {
        const direct = byComponentId.get(node.id);
        if (direct) {
          result.set(node.id, viewFromRate(direct, false, undefined));
          continue;
        }
        if (!fallbackRate) {
          result.set(node.id, unknownView());
          continue;
        }
        const ambiguous = fallbackSiblings.length > 1;
        result.set(
          node.id,
          viewFromRate(fallbackRate, ambiguous, ambiguous ? fallbackSiblings.length : undefined)
        );
      }
    }
  }

  attributeGroup(model.sources, 'source');
  attributeGroup(model.destinations, 'destination');

  return result;
}

export interface PipelineActivitySummary {
  activity: NodeActivity;
  slow: boolean;
  recordsPerSec: number | undefined;
  /** Set (to the destination count) when the destination side has >1 connector and no component_id — the pipeline-level number is the authoritative aggregate for that ambiguous case. */
  ambiguousDestinationCount: number | undefined;
}

/**
 * Pipeline-level activity summary — the fallback view for fan-in/fan-out
 * pipelines (where individual node attribution is ambiguous) and the always-on
 * "at a glance" reading shown next to the pipeline's status.
 *
 * Summed over DESTINATION rates specifically, not source: a record only counts as
 * "flowing" once it's been durably written downstream, consistent with the
 * ack-durability framing (never claim throughput before the destination confirms
 * it) rather than merely "read from the source."
 */
export function summarizePipelineActivity(
  destinationCount: number,
  snapshot: PipelineMetricsSnapshot | undefined
): PipelineActivitySummary {
  if (!snapshot) {
    return {
      activity: 'unknown',
      slow: false,
      recordsPerSec: undefined,
      ambiguousDestinationCount: undefined,
    };
  }

  const destRates = snapshot.connectorRates.filter((r) => r.pluginType === 'destination');

  let recordsPerSec: number | undefined;
  let anyDefined = false;
  for (const r of destRates) {
    if (r.recordsPerSec !== undefined) {
      recordsPerSec = (recordsPerSec ?? 0) + r.recordsPerSec;
      anyDefined = true;
    }
  }
  if (!anyDefined) recordsPerSec = undefined;

  const slow = destRates.some(
    (r) => r.p95LatencySeconds !== undefined && r.p95LatencySeconds > SLOW_LATENCY_THRESHOLD_SECONDS
  );
  const { activity } = classify(recordsPerSec, undefined);
  const ambiguousDestinationCount =
    !snapshot.hasComponentId && destinationCount > 1 ? destinationCount : undefined;

  return { activity, slow, recordsPerSec, ambiguousDestinationCount };
}

/** Shared formatting so the node badges and the pipeline-level badge can never drift in how a rate reads. */
export function formatRecordsPerSec(recordsPerSec: number): string {
  if (recordsPerSec <= 0) return '0 rec/s';
  if (recordsPerSec < 1) return '<1 rec/s';
  return `${Math.round(recordsPerSec)} rec/s`;
}

export function formatBytesPerSec(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}
