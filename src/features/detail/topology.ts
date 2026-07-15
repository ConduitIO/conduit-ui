import type {
  SchemaV1Pipeline,
  SchemaApiv1Connector,
  SchemaApiv1Processor,
} from '../../api/schema';

// A render-ready model of a pipeline's topology: source connectors on the left, a
// shared pipeline-level processor chain in the middle, destination connectors on
// the right, with connector-level processors hanging off their connector node.
//
// This is pure and DOM-free so the ordering/grouping/placeholder logic is unit
// tested without React (same split as buildFleetModel). The wire gives us the
// pieces separately — the pipeline (with ordered id arrays), the connectors, and
// the processors — and NO per-node status or throughput (only the pipeline has a
// status); nodes here are therefore identity-only.
//
// Ordering is authoritative from the ordered `processorIds[]` arrays (pipeline-level
// on the pipeline, connector-level on each connector), NOT from the processor
// objects — the objects are only a lookup pool.

export interface TopologyProcessorNode {
  id: string;
  label: string;
  /** Processor has a `condition` template — it runs only for matching records. */
  conditional: boolean;
  /** True when an id referenced by an ordered array had no object in the response. */
  unavailable: boolean;
}

export interface TopologyConnectorNode {
  id: string;
  label: string;
  plugin: string | undefined;
  /** Connector-level processors, in the connector's `processorIds` order. */
  processors: TopologyProcessorNode[];
  /** True when an id in `connectorIds` had no object in the connectors response. */
  unavailable: boolean;
}

export interface TopologyModel {
  sources: TopologyConnectorNode[];
  destinations: TopologyConnectorNode[];
  /** Connectors with an unspecified/unknown type, or unavailable placeholders. */
  other: TopologyConnectorNode[];
  /** The shared pipeline-level processor chain (the middle column), ordered. */
  pipelineProcessors: TopologyProcessorNode[];
  /**
   * Processors returned by the API but not referenced by any ordered array — a
   * data inconsistency. Surfaced rather than silently dropped.
   */
  orphanProcessors: TopologyProcessorNode[];
  /** No connectors configured on the pipeline. */
  isEmpty: boolean;
}

function connectorLabel(c: SchemaApiv1Connector): string {
  return c.config?.name?.trim() || c.plugin || c.id || '(unnamed)';
}

function processorNode(
  p: SchemaApiv1Processor | undefined,
  id: string,
  consumed: Set<string>
): TopologyProcessorNode {
  if (!p) {
    return { id, label: id || '(unknown)', conditional: false, unavailable: true };
  }
  consumed.add(id);
  return {
    id,
    label: p.plugin || p.id || '(unnamed)',
    conditional: Boolean(p.condition && p.condition.trim().length > 0),
    unavailable: false,
  };
}

// Build the ordered processor chain for a set of ids, looking each up in the index.
// `rendered` dedupes across all arrays (an id must produce at most one node — it's
// used as a React key), while `consumed` tracks which real processor objects were
// placed so orphans can be detected afterward.
function resolveProcessors(
  ids: readonly string[] | undefined,
  index: Map<string, SchemaApiv1Processor>,
  consumed: Set<string>,
  rendered: Set<string>
): TopologyProcessorNode[] {
  const out: TopologyProcessorNode[] = [];
  for (const id of ids ?? []) {
    if (rendered.has(id)) continue; // skip a duplicate id — one node per id
    rendered.add(id);
    out.push(processorNode(index.get(id), id, consumed));
  }
  return out;
}

export function buildTopologyModel(
  pipeline: SchemaV1Pipeline,
  connectors: readonly SchemaApiv1Connector[],
  processors: readonly SchemaApiv1Processor[]
): TopologyModel {
  const connectorIndex = new Map<string, SchemaApiv1Connector>();
  for (const c of connectors) if (c.id) connectorIndex.set(c.id, c);

  const processorIndex = new Map<string, SchemaApiv1Processor>();
  for (const p of processors) if (p.id) processorIndex.set(p.id, p);

  // `consumed` = ids that matched a real processor object (for orphan detection);
  // `renderedProcessors` = every id turned into a node (for dedupe / key safety).
  const consumed = new Set<string>();
  const renderedProcessors = new Set<string>();
  const seenConnectors = new Set<string>();

  const sources: TopologyConnectorNode[] = [];
  const destinations: TopologyConnectorNode[] = [];
  const other: TopologyConnectorNode[] = [];

  // Walk the pipeline's ordered connector ids so order is stable and a missing
  // connector (provisioning race) becomes a visible placeholder, not a silent gap.
  const connectorIds = pipeline.connectorIds ?? [];
  for (const id of connectorIds) {
    if (seenConnectors.has(id)) continue; // one node per id (React key safety)
    seenConnectors.add(id);
    const c = connectorIndex.get(id);
    if (!c) {
      // Unknown type (no object), so it can't be bucketed as source/destination.
      other.push({ id, label: id, plugin: undefined, processors: [], unavailable: true });
      continue;
    }
    const node: TopologyConnectorNode = {
      id,
      label: connectorLabel(c),
      plugin: c.plugin,
      processors: resolveProcessors(c.processorIds, processorIndex, consumed, renderedProcessors),
      unavailable: false,
    };
    switch (c.type) {
      case 'TYPE_SOURCE':
        sources.push(node);
        break;
      case 'TYPE_DESTINATION':
        destinations.push(node);
        break;
      default:
        other.push(node);
        break;
    }
  }

  const pipelineProcessors = resolveProcessors(
    pipeline.processorIds,
    processorIndex,
    consumed,
    renderedProcessors
  );

  // Any processor returned but never referenced by an ordered array is an orphan.
  const orphanProcessors: TopologyProcessorNode[] = processors
    .filter((p) => p.id && !consumed.has(p.id))
    .map((p) => ({
      id: p.id as string,
      label: p.plugin || (p.id as string),
      conditional: Boolean(p.condition && p.condition.trim().length > 0),
      unavailable: false,
    }));

  return {
    sources,
    destinations,
    other,
    pipelineProcessors,
    orphanProcessors,
    isEmpty: connectorIds.length === 0,
  };
}
