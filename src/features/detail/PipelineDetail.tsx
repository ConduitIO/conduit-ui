import { Link, useParams } from 'react-router-dom';
import type { SchemaV1Pipeline } from '../../api/schema';
import {
  usePipelineDetail,
  usePipelineTopology,
  PipelineNotFoundError,
  type Topology,
} from '../../api/pipelineDetail';
import { describePipelineStatus } from '../../domain/pipelineStatus';
import { StatusPill } from '../../components/StatusPill';
import { buildTopologyModel } from './topology';
import { TopologyGraph } from './TopologyGraph';
import styles from './PipelineDetail.module.css';

// Minimal read-only view of the query state each section needs; typed as a subset
// of TanStack's UseQueryResult so the container can pass the query object directly
// and tests can pass plain fixtures.
interface QueryLike<T> {
  data: T | undefined;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
}

// Container: reads the :id route param and wires the two polling queries to the
// presentational content. Kept thin so all rendering is testable without queries.
export function PipelineDetail() {
  const { id = '' } = useParams();
  const detail = usePipelineDetail(id);
  const topology = usePipelineTopology(id);
  return <PipelineDetailContent id={id} detail={detail} topology={topology} />;
}

export interface PipelineDetailContentProps {
  id: string;
  detail: QueryLike<SchemaV1Pipeline>;
  topology: QueryLike<Topology>;
  /** Engine base URL for the unreachable message. Empty = same-origin. */
  baseUrl?: string | undefined;
}

export function PipelineDetailContent({
  id,
  detail,
  topology,
  baseUrl,
}: PipelineDetailContentProps) {
  // A 404 is a distinct, terminal state (not "unreachable"); check it first.
  if (detail.error instanceof PipelineNotFoundError) {
    return <NotFound id={id} />;
  }

  // No data yet: either the engine is unreachable (isError) or we're still loading
  // (pending/idle). Handling both here narrows `data` to defined below.
  if (detail.data === undefined) {
    if (detail.isError) {
      const target = baseUrl && baseUrl.length > 0 ? baseUrl : 'the Conduit engine (same origin)';
      return (
        <section aria-labelledby="detail-heading">
          <BackLink />
          <h2 id="detail-heading">Pipeline</h2>
          <div className={styles.connectionError} role="alert">
            <p>Can’t reach {target}.</p>
            {detail.error?.message && <p className={styles.muted}>{detail.error.message}</p>}
            <p className={styles.muted}>Retrying automatically.</p>
          </div>
        </section>
      );
    }
    return (
      <section aria-labelledby="detail-heading" aria-busy="true">
        <BackLink />
        <h2 id="detail-heading">Pipeline</h2>
        <div className={styles.skeleton} role="status">
          Loading pipeline…
        </div>
      </section>
    );
  }

  const pipeline = detail.data;
  const display = describePipelineStatus(pipeline.state);
  const name = pipeline.config?.name?.trim() || pipeline.id || id;

  return (
    <article aria-labelledby="detail-heading">
      <BackLink />
      <header className={styles.header}>
        <h2 id="detail-heading" className={styles.title}>
          {name}
        </h2>
        <StatusPill tone={display.tone} label={display.label} />
      </header>

      {/* Refetch failed but we have last-known data — keep it, flag staleness. */}
      {detail.isError && (
        <div className={styles.staleBanner} role="status">
          Showing last-known state — couldn’t refresh
          {detail.error?.message ? ` (${detail.error.message})` : ''}.
        </div>
      )}

      <dl className={styles.meta}>
        <Meta term="ID" value={pipeline.id || id} mono />
        {pipeline.config?.description?.trim() && (
          <Meta term="Description" value={pipeline.config.description} />
        )}
        {pipeline.state?.error && display.needsAttention && (
          <Meta term="Error" value={pipeline.state.error} mono />
        )}
      </dl>

      <TopologySection pipeline={pipeline} topology={topology} pipelineName={name} />
    </article>
  );
}

function TopologySection({
  pipeline,
  topology,
  pipelineName,
}: {
  pipeline: SchemaV1Pipeline;
  topology: QueryLike<Topology>;
  pipelineName: string;
}) {
  // No topology yet: a failure shows a non-blocking note (identity/status above
  // still render — never a blank view); otherwise a loading skeleton. Both narrow
  // `data` to defined below.
  if (topology.data === undefined) {
    if (topology.isError) {
      return (
        <p className={styles.topologyUnavailable} role="status">
          Topology unavailable{topology.error?.message ? ` (${topology.error.message})` : ''}.
          Retrying automatically.
        </p>
      );
    }
    return (
      <div className={styles.skeleton} role="status">
        Loading topology…
      </div>
    );
  }

  const data = topology.data;
  const model = buildTopologyModel(pipeline, data.connectors, data.processors);
  // Only the "no connectors configured" message when there is genuinely nothing to
  // show — a pipeline with zero connectors but dangling pipeline-level or orphan
  // processors (mid-reconfiguration) must still render them, not hide them.
  const isTrulyEmpty =
    model.isEmpty && model.pipelineProcessors.length === 0 && model.orphanProcessors.length === 0;

  return (
    <>
      {topology.isError && (
        <div className={styles.staleBanner} role="status">
          Topology may be stale — couldn’t refresh.
        </div>
      )}
      {data.processorsUnavailable && (
        <p className={styles.topologyUnavailable} role="status">
          Processor details are temporarily unavailable; showing connectors only.
        </p>
      )}
      {isTrulyEmpty ? (
        <p className={styles.emptyGraph}>
          No connectors configured. Add them via <code>conduit pipelines</code> or a config file —
          this UI observes pipelines, it doesn’t author them.
        </p>
      ) : (
        <TopologyGraph model={model} pipelineName={pipelineName} />
      )}
    </>
  );
}

function Meta({ term, value, mono = false }: { term: string; value: string; mono?: boolean }) {
  return (
    <div className={styles.metaRow}>
      <dt className={styles.metaTerm}>{term}</dt>
      <dd className={mono ? styles.metaValueMono : styles.metaValue}>{value}</dd>
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/" className={styles.backLink}>
      ← Pipelines
    </Link>
  );
}

function NotFound({ id }: { id: string }) {
  return (
    <section aria-labelledby="detail-heading">
      <BackLink />
      <h2 id="detail-heading">Pipeline not found</h2>
      <p className={styles.muted}>
        No pipeline with id <code>{id}</code>. It may have been deleted, or the id is wrong.
      </p>
    </section>
  );
}
