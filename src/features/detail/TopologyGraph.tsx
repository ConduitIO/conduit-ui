import type { TopologyModel, TopologyConnectorNode, TopologyProcessorNode } from './topology';
import {
  formatBytesPerSec,
  formatRecordsPerSec,
  SLOW_LATENCY_THRESHOLD_SECONDS,
  type NodeMetricView,
  type PipelineActivitySummary,
} from './nodeMetrics';
import styles from './PipelineDetail.module.css';

// A read-only source(s) → processors → destination(s) view. Conduit pipelines are
// linear (fan-in/out only at the two ends), so this is hand-rolled semantic HTML —
// three ordered lists in columns — rather than a graph library. That keeps the
// screen-reader equivalent free (the lists ARE the structure) and adds no dependency.
//
// The wire exposes no per-node status (only the pipeline has one), so connector
// nodes stay identity-only for that. UI-5 adds an optional `nodeMetrics` prop:
// per-connector throughput (records/sec, bytes/sec), a "slow" badge from p95
// write/read latency, and an honest "idle" label — never a "stalled" state, since
// nothing on the wire distinguishes genuine idle from a hung read/write (see the
// UI-5 plan's scope decision). A node absent from `nodeMetrics` (not Running, no
// metrics yet, or an `other`/unspecified-type connector) simply renders no badge.

function NodeMetricBadge({ metrics }: { metrics: NodeMetricView }) {
  // Nothing to say yet (still warming up / metrics unreachable) and not a
  // combined-attribution case either — render nothing rather than a placeholder.
  if (metrics.activity === 'unknown' && !metrics.ambiguous) return null;

  return (
    <span className={styles.nodeMetric} data-activity={metrics.activity} data-slow={metrics.slow}>
      {metrics.activity === 'flowing' && metrics.recordsPerSec !== undefined && (
        <span className={styles.nodeMetricRate}>
          {formatRecordsPerSec(metrics.recordsPerSec)}
          {metrics.bytesPerSec !== undefined && ` · ${formatBytesPerSec(metrics.bytesPerSec)}`}
        </span>
      )}
      {metrics.activity === 'idle' && (
        <span className={styles.nodeMetricTag}>idle — no recent activity</span>
      )}
      {metrics.slow && (
        <span
          className={styles.nodeMetricTag}
          title={`p95 latency above ${SLOW_LATENCY_THRESHOLD_SECONDS}s`}
        >
          slow
        </span>
      )}
      {metrics.ambiguous && metrics.combinedAcrossCount !== undefined && (
        <span className={styles.nodeMetricTag}>combined across {metrics.combinedAcrossCount}</span>
      )}
    </span>
  );
}

function ProcessorItems({ processors }: { processors: TopologyProcessorNode[] }) {
  return (
    <ol className={styles.subProcessors}>
      {processors.map((p) => (
        <li key={p.id} className={styles.subProcessor} data-unavailable={p.unavailable}>
          <span className={styles.nodeLabel}>{p.label}</span>
          {p.conditional && <span className={styles.nodeTag}>conditional</span>}
          {p.unavailable && <span className={styles.nodeTag}>unavailable</span>}
        </li>
      ))}
    </ol>
  );
}

function ConnectorNode({
  node,
  metrics,
}: {
  node: TopologyConnectorNode;
  metrics?: NodeMetricView | undefined;
}) {
  return (
    <li className={styles.node} data-unavailable={node.unavailable}>
      <span className={styles.nodeLabel}>{node.label}</span>
      {node.plugin && <span className={styles.nodePlugin}>{node.plugin}</span>}
      {node.unavailable && <span className={styles.nodeTag}>unavailable</span>}
      {metrics && <NodeMetricBadge metrics={metrics} />}
      {node.processors.length > 0 && <ProcessorItems processors={node.processors} />}
    </li>
  );
}

function ConnectorColumn({
  title,
  nodes,
  nodeMetrics,
}: {
  title: string;
  nodes: TopologyConnectorNode[];
  nodeMetrics?: Map<string, NodeMetricView> | undefined;
}) {
  return (
    <div className={styles.column}>
      <h3 className={styles.columnTitle}>
        {title} <span className={styles.columnCount}>{nodes.length}</span>
      </h3>
      {nodes.length === 0 ? (
        <p className={styles.columnEmpty}>none</p>
      ) : (
        // Scrollable so a large fan (200+ connectors) stays usable without hiding
        // any node from assistive tech — every node stays in the DOM.
        <ol className={styles.nodeList}>
          {nodes.map((n) => (
            <ConnectorNode key={n.id} node={n} metrics={nodeMetrics?.get(n.id)} />
          ))}
        </ol>
      )}
    </div>
  );
}

export function TopologyGraph({
  model,
  pipelineName,
  nodeMetrics,
  activitySummary,
}: {
  model: TopologyModel;
  pipelineName: string;
  /** UI-5: per-connector-node throughput/latency, keyed by node id. Omit (or pass an empty map) when the pipeline isn't Running, or metrics aren't available yet — nodes simply render without a badge. */
  nodeMetrics?: Map<string, NodeMetricView> | undefined;
  /** UI-5: overall pipeline activity, appended to the screen-reader summary below (no per-node aria-live spam — the visual badges above are enough for sighted users). */
  activitySummary?: PipelineActivitySummary | undefined;
}) {
  return (
    <section className={styles.graph} aria-label={`${pipelineName} topology`}>
      {/* Screen-reader direction context: the visible arrows are decorative, so state
          the flow in text. The columns below are real ordered lists a screen reader
          reads in full — nothing is hidden from assistive tech. */}
      <p className={styles.srOnly}>
        Data flows left to right: {model.sources.length} source
        {model.sources.length === 1 ? '' : 's'} → {model.pipelineProcessors.length} pipeline
        processor{model.pipelineProcessors.length === 1 ? '' : 's'} → {model.destinations.length}{' '}
        destination{model.destinations.length === 1 ? '' : 's'}.
      </p>
      {activitySummary && activitySummary.activity !== 'unknown' && (
        <p className={styles.srOnly}>
          Pipeline is currently {activitySummary.activity}
          {activitySummary.slow ? ', with elevated write latency' : ''}.
        </p>
      )}

      <div className={styles.columns}>
        <ConnectorColumn title="Sources" nodes={model.sources} nodeMetrics={nodeMetrics} />
        <span className={styles.arrow} aria-hidden="true">
          →
        </span>
        <div className={styles.column}>
          <h3 className={styles.columnTitle}>
            Processors <span className={styles.columnCount}>{model.pipelineProcessors.length}</span>
          </h3>
          {model.pipelineProcessors.length === 0 ? (
            <p className={styles.columnEmpty}>none</p>
          ) : (
            <ol className={styles.nodeList}>
              {model.pipelineProcessors.map((p) => (
                <li key={p.id} className={styles.node} data-unavailable={p.unavailable}>
                  <span className={styles.nodeLabel}>{p.label}</span>
                  {p.conditional && <span className={styles.nodeTag}>conditional</span>}
                  {p.unavailable && <span className={styles.nodeTag}>unavailable</span>}
                </li>
              ))}
            </ol>
          )}
        </div>
        <span className={styles.arrow} aria-hidden="true">
          →
        </span>
        <ConnectorColumn
          title="Destinations"
          nodes={model.destinations}
          nodeMetrics={nodeMetrics}
        />
      </div>

      {model.other.length > 0 && (
        <div className={styles.auxSection}>
          <h3 className={styles.columnTitle}>
            Other <span className={styles.columnCount}>{model.other.length}</span>
          </h3>
          <ol className={styles.nodeList}>
            {model.other.map((n) => (
              <ConnectorNode key={n.id} node={n} />
            ))}
          </ol>
        </div>
      )}

      {model.orphanProcessors.length > 0 && (
        <div className={styles.auxSection}>
          <h3 className={styles.columnTitle}>Unattached processors</h3>
          <p className={styles.columnEmpty}>
            These processors are not referenced by the pipeline or any connector — likely a
            configuration inconsistency.
          </p>
          <ProcessorItems processors={model.orphanProcessors} />
        </div>
      )}
    </section>
  );
}
