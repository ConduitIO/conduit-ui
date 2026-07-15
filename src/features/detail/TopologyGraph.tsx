import type { TopologyModel, TopologyConnectorNode, TopologyProcessorNode } from './topology';
import styles from './PipelineDetail.module.css';

// A read-only source(s) → processors → destination(s) view. Conduit pipelines are
// linear (fan-in/out only at the two ends), so this is hand-rolled semantic HTML —
// three ordered lists in columns — rather than a graph library. That keeps the
// screen-reader equivalent free (the lists ARE the structure) and adds no dependency.
//
// The wire exposes no per-node status or throughput (only the pipeline has a
// status), so nodes are identity-only here; per-node health is deferred to UI-5.

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

function ConnectorNode({ node }: { node: TopologyConnectorNode }) {
  return (
    <li className={styles.node} data-unavailable={node.unavailable}>
      <span className={styles.nodeLabel}>{node.label}</span>
      {node.plugin && <span className={styles.nodePlugin}>{node.plugin}</span>}
      {node.unavailable && <span className={styles.nodeTag}>unavailable</span>}
      {node.processors.length > 0 && <ProcessorItems processors={node.processors} />}
    </li>
  );
}

function ConnectorColumn({ title, nodes }: { title: string; nodes: TopologyConnectorNode[] }) {
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
            <ConnectorNode key={n.id} node={n} />
          ))}
        </ol>
      )}
    </div>
  );
}

export function TopologyGraph({
  model,
  pipelineName,
}: {
  model: TopologyModel;
  pipelineName: string;
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

      <div className={styles.columns}>
        <ConnectorColumn title="Sources" nodes={model.sources} />
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
        <ConnectorColumn title="Destinations" nodes={model.destinations} />
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
