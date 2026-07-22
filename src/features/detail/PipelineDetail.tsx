import { Link, useParams } from 'react-router-dom';
import type { SchemaV1Pipeline } from '../../api/schema';
import {
  usePipelineDetail,
  usePipelineTopology,
  PipelineNotFoundError,
  type Topology,
} from '../../api/pipelineDetail';
import { usePipelineMetrics, type PipelineMetricsSnapshot } from '../../api/pipelineMetrics';
import { describePipelineStatus } from '../../domain/pipelineStatus';
import { StatusPill } from '../../components/StatusPill';
import { OperateControls } from '../operate/OperateControls';
import { buildTopologyModel } from './topology';
import { TopologyGraph } from './TopologyGraph';
import { RecordFlow } from './recordFlow/RecordFlow';
import { attributeToNodes, summarizePipelineActivity } from './nodeMetrics';
import { PipelineActivityBadge } from './PipelineActivityBadge';
import styles from './PipelineDetail.module.css';

// Minimal read-only view of the query state each section needs; typed as a subset
// of TanStack's UseQueryResult so the container can pass the query object directly
// and tests can pass plain fixtures.
interface QueryLike<T> {
  data: T | undefined;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  /**
   * Epoch ms of the query's last successful fetch, and last FAILED fetch
   * attempt. Threaded through to OperateControls (UI-6) as informational
   * metadata — see usePipelineOperate's doc comment. Default to 0 in tests
   * that don't care about operate reconciliation.
   */
  dataUpdatedAt: number;
  errorUpdatedAt: number;
  /**
   * True while this query's most recent fetch attempt is in flight. This is
   * what the operate reconciliation gate actually watches — it must compare
   * against the SAME query that supplies `pipeline` here, not an unrelated
   * one — see usePipelineOperate's doc comment. Default to false in tests
   * that don't care about operate reconciliation.
   */
  isFetching: boolean;
}

// Container: reads the :id route param and wires the two polling queries to the
// presentational content. Kept thin so all rendering is testable without queries.
export function PipelineDetail() {
  const { id = '' } = useParams();
  const detail = usePipelineDetail(id);
  const topology = usePipelineTopology(id);
  // pipeline_name is the wire's metrics label (display name, not the pipeline
  // ID — see pipelineMetrics.ts); before `detail` resolves this is '', which
  // simply matches no samples until the name is known. Hooks can't be called
  // conditionally, so this always runs.
  const pipelineName = detail.data?.config?.name?.trim() || detail.data?.id || '';
  const metrics = usePipelineMetrics(pipelineName);
  return <PipelineDetailContent id={id} detail={detail} topology={topology} metrics={metrics} />;
}

export interface PipelineDetailContentProps {
  id: string;
  detail: QueryLike<SchemaV1Pipeline>;
  topology: QueryLike<Topology>;
  /** UI-5: optional so existing callers/tests that predate metrics keep working unchanged — omitted is treated as "no metrics yet", never as an error. */
  metrics?: QueryLike<PipelineMetricsSnapshot> | undefined;
  /** Engine base URL for the unreachable message. Empty = same-origin. */
  baseUrl?: string | undefined;
}

const NO_METRICS: QueryLike<PipelineMetricsSnapshot> = {
  data: undefined,
  isPending: false,
  isError: false,
  error: null,
  dataUpdatedAt: 0,
  errorUpdatedAt: 0,
  isFetching: false,
};

export function PipelineDetailContent({
  id,
  detail,
  topology,
  metrics = NO_METRICS,
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
        <OperateControls
          pipeline={pipeline}
          query={{
            dataUpdatedAt: detail.dataUpdatedAt,
            isError: detail.isError,
            errorUpdatedAt: detail.errorUpdatedAt,
            isFetching: detail.isFetching,
          }}
        />
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

      <TopologySection
        pipeline={pipeline}
        topology={topology}
        metrics={metrics}
        pipelineName={name}
        running={display.tone === 'running'}
      />
    </article>
  );
}

function TopologySection({
  pipeline,
  topology,
  metrics,
  pipelineName,
  running,
}: {
  pipeline: SchemaV1Pipeline;
  topology: QueryLike<Topology>;
  metrics: QueryLike<PipelineMetricsSnapshot>;
  pipelineName: string;
  /** Only while Running does an "idle"/"flowing" reading mean anything (AC5) — see PipelineActivityBadge and nodeMetrics.ts. */
  running: boolean;
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

  // UI-5: node/pipeline activity is only meaningful while Running (AC5) — when
  // not, skip computing it and simply render the identity-only graph, same as
  // before this slice. A metrics-fetch failure never blanks the graph: `metrics`
  // failing degrades to no badges, mirroring `processorsUnavailable` below.
  //
  // Both `nodeMetrics` and `activitySummary` MUST be gated on `running` the same
  // way: a Stopped pipeline can still be holding stale `metrics.data` from before
  // it stopped (polling continues; byte counters stop increasing, so the derived
  // rate settles to 0 → activity 'idle', a defined non-'unknown' state). Passing
  // that stale snapshot through unconditionally would make TopologyGraph's
  // screen-reader-only sentence assert "Pipeline is currently idle" for a Stopped
  // pipeline — a false claim on the SR channel even though the visible
  // PipelineActivityBadge correctly renders nothing (it checks `running`
  // itself). Feeding `undefined` here instead of `metrics.data` makes
  // summarizePipelineActivity return its 'unknown' summary, which keeps both the
  // visual and SR channels silent together.
  const nodeMetrics = running ? attributeToNodes(model, metrics.data) : undefined;
  const activitySummary = summarizePipelineActivity(
    model.destinations.length,
    running ? metrics.data : undefined
  );

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
      {metrics.data === undefined && metrics.isError && (
        <p className={styles.topologyUnavailable} role="status">
          Metrics unavailable{metrics.error?.message ? ` (${metrics.error.message})` : ''} — showing
          topology only.
        </p>
      )}
      {metrics.data !== undefined && metrics.isError && (
        <div className={styles.staleBanner} role="status">
          Metrics may be stale — couldn’t refresh.
        </div>
      )}
      {isTrulyEmpty ? (
        <p className={styles.emptyGraph}>
          No connectors configured. Add them via <code>conduit pipelines</code> or a config file —
          this UI observes pipelines, it doesn’t author them.
        </p>
      ) : (
        <>
          <PipelineActivityBadge summary={activitySummary} running={running} />
          <TopologyGraph
            model={model}
            pipelineName={pipelineName}
            nodeMetrics={nodeMetrics}
            activitySummary={activitySummary}
          />
          {/* UI-4: live record flow + per-stage diff, keyed off the same
              topology model so stage ordering can never drift from the graph
              above it (see recordFlow/stages.ts). */}
          <RecordFlow model={model} pipelineName={pipelineName} />
        </>
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
