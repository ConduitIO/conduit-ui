import type { InspectKind } from '../../../api/streaming';
import type { TopologyConnectorNode, TopologyModel, TopologyProcessorNode } from '../topology';

// Derives the ordered list of Inspect-able stages from UI-3's TopologyModel, so
// record-flow stage ordering can never drift from the graph's ordering (the plan's
// Decision: "reuses UI-3's TopologyModel ... avoiding parallel topology walking").
//
// Execution order for a record: [primary source connector] -> [that source's
// processors, in then out, each] -> [pipeline-level processors, in then out,
// each] -> for each destination: [that destination's processors, in then out]
// -> [destination connector].
//
// A processor's "in" and "out" inspectors are two separate Inspect connections
// (two Stages) but share one componentId — the engine's drop counter is keyed by
// component_id and already sums in+out drops for that processor (see
// api/dropRate.ts), which is why Stage carries componentId separately from id.

export interface Stage {
  /** Unique within one stage list; used as the React key and buffer map key. */
  id: string;
  /** Display label, e.g. "postgres-source" or "redact-email (out)". */
  label: string;
  /** Connector or processor id — the Inspect URL param and the drop-metric key. */
  componentId: string;
  inspectKind: InspectKind;
}

function connectorStage(node: TopologyConnectorNode): Stage {
  return { id: node.id, label: node.label, componentId: node.id, inspectKind: 'connector' };
}

function processorStages(node: TopologyProcessorNode): Stage[] {
  return [
    {
      id: `${node.id}:in`,
      label: `${node.label} (in)`,
      componentId: node.id,
      inspectKind: 'processor-in',
    },
    {
      id: `${node.id}:out`,
      label: `${node.label} (out)`,
      componentId: node.id,
      inspectKind: 'processor-out',
    },
  ];
}

/**
 * Builds the ordered stage list for the live record flow. Unavailable/placeholder
 * nodes (an id referenced by the pipeline with no matching object — see
 * topology.ts) are skipped entirely: there is nothing to open an Inspect
 * connection to.
 *
 * TODO(UI-4): multiple-source pipelines. A pipeline can fan in from more than one
 * source, but there is exactly one "primary" live timeline in this UI (the plan's
 * Decision 2/§9 open question #1). v1 deterministically uses only
 * `model.sources[0]` — other sources' connectors and their processors are not
 * inspected here at all, so their records never appear in the live table or the
 * per-stage diff. A source picker is out of scope for this slice; flag to
 * DeVaris whether it's needed before ship or a fast-follow.
 */
export function buildStageList(model: TopologyModel): Stage[] {
  const stages: Stage[] = [];

  const primarySource = model.sources[0];
  if (primarySource !== undefined && !primarySource.unavailable) {
    stages.push(connectorStage(primarySource));
    for (const p of primarySource.processors) {
      if (p.unavailable) continue;
      stages.push(...processorStages(p));
    }
  }

  for (const p of model.pipelineProcessors) {
    if (p.unavailable) continue;
    stages.push(...processorStages(p));
  }

  for (const dest of model.destinations) {
    if (dest.unavailable) continue;
    for (const p of dest.processors) {
      if (p.unavailable) continue;
      stages.push(...processorStages(p));
    }
    stages.push(connectorStage(dest));
  }

  return stages;
}
