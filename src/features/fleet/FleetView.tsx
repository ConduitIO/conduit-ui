import type { SchemaV1Pipeline } from '../../api/schema';
import { usePipelines } from '../../api/pipelines';
import { buildFleetModel, type FleetCounts, type FleetEntry } from './fleet';
import { PipelineRow } from './PipelineRow';
import styles from './FleetView.module.css';

// Container: wires the polling query to the presentational content. Kept thin so
// all rendering logic is testable without query/network machinery.
export function FleetView() {
  const query = usePipelines();
  // NOTE: no `baseUrl` is threaded through — the client defaults to same-origin
  // (the embedded-UI case), so the unreachable-at-load message correctly says
  // "same origin". When a dev-mode remote-engine override is added, thread that
  // URL both into createConduitClient AND here, or this message goes stale.
  return (
    <FleetContent
      pipelines={query.data}
      isPending={query.isPending}
      isError={query.isError}
      error={query.error}
      dataUpdatedAt={query.dataUpdatedAt}
      errorUpdatedAt={query.errorUpdatedAt}
    />
  );
}

export interface FleetContentProps {
  pipelines: SchemaV1Pipeline[] | undefined;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  /** Engine base URL, for the unreachable-at-load message. Empty = same-origin. */
  baseUrl?: string | undefined;
  /**
   * Epoch ms of this query's last successful fetch, and last FAILED fetch
   * attempt. Threaded down to each row's OperateControls (UI-6) — the operate
   * reconciliation gate must compare against the SAME query that supplies
   * `pipelines` here (all rows share one list query, so one pair of
   * timestamps for all of them). Default to 0 in tests/call sites that don't
   * exercise operate reconciliation.
   */
  dataUpdatedAt?: number;
  errorUpdatedAt?: number;
}

// Health-first landing view. Answers "is anything wrong?" with zero clicks (the
// count header + the needs-attention section above the fold) and gets to a
// degraded pipeline's cause in <=2 (expand the row). Read-only: it observes and
// links out; it never authors pipelines.
export function FleetContent({
  pipelines,
  isPending,
  isError,
  error,
  baseUrl,
  dataUpdatedAt = 0,
  errorUpdatedAt = 0,
}: FleetContentProps) {
  const hasData = pipelines !== undefined;

  // First load, nothing to show yet.
  if (!hasData && isPending) {
    return (
      <section aria-labelledby="fleet-heading" aria-busy="true">
        <h2 id="fleet-heading">Pipelines</h2>
        <div className={styles.skeleton} role="status">
          Loading pipelines…
        </div>
      </section>
    );
  }

  // Never loaded and the engine is unreachable — name the target so the operator
  // knows what to check, rather than an infinite skeleton.
  if (!hasData && isError) {
    const target = baseUrl && baseUrl.length > 0 ? baseUrl : 'the Conduit engine (same origin)';
    return (
      <section aria-labelledby="fleet-heading">
        <h2 id="fleet-heading">Pipelines</h2>
        <div className={styles.connectionError} role="alert">
          <p>Can’t reach {target}.</p>
          {error?.message && <p className={styles.muted}>{error.message}</p>}
          <p className={styles.muted}>Retrying automatically.</p>
        </div>
      </section>
    );
  }

  const model = buildFleetModel(pipelines ?? []);

  return (
    <section aria-labelledby="fleet-heading">
      <h2 id="fleet-heading">Pipelines</h2>

      {/* A failed refetch after a prior success keeps the last-known list and shows
          this banner — the list is never cleared (a cleared list reads as "no
          pipelines", a false negative). */}
      {isError && (
        <div className={styles.staleBanner} role="status">
          Showing last-known state — couldn’t refresh
          {error?.message ? ` (${error.message})` : ''}.
        </div>
      )}

      {model.counts.total === 0 ? (
        <EmptyState />
      ) : (
        <>
          <CountHeader counts={model.counts} />
          {model.needsAttention.length > 0 && (
            <FleetSection
              title="Needs attention"
              tone="attention"
              entries={model.needsAttention}
              expandable
              dataUpdatedAt={dataUpdatedAt}
              isQueryError={isError}
              errorUpdatedAt={errorUpdatedAt}
            />
          )}
          {model.running.length > 0 && (
            <FleetSection
              title="Running"
              tone="calm"
              entries={model.running}
              dataUpdatedAt={dataUpdatedAt}
              isQueryError={isError}
              errorUpdatedAt={errorUpdatedAt}
            />
          )}
          {model.calm.length > 0 && (
            <FleetSection
              title="Stopped"
              tone="calm"
              entries={model.calm}
              dataUpdatedAt={dataUpdatedAt}
              isQueryError={isError}
              errorUpdatedAt={errorUpdatedAt}
            />
          )}
          {model.unknown.length > 0 && (
            <FleetSection
              title="Unknown"
              tone="calm"
              entries={model.unknown}
              dataUpdatedAt={dataUpdatedAt}
              isQueryError={isError}
              errorUpdatedAt={errorUpdatedAt}
            />
          )}
        </>
      )}
    </section>
  );
}

function CountHeader({ counts }: { counts: FleetCounts }) {
  // aria-live polite + a stable node: the region always renders in the same place
  // and only its text mutates, so a screen reader announces changed counts without
  // re-announcing identical content on every poll tick.
  const attention = counts.degraded + counts.recovering;
  return (
    <div
      className={styles.countHeader}
      aria-live="polite"
      data-attention={attention > 0 ? 'true' : 'false'}
    >
      <Count label="Running" value={counts.running} />
      <Count label="Degraded" value={counts.degraded} emphasize={counts.degraded > 0} />
      <Count label="Recovering" value={counts.recovering} emphasize={counts.recovering > 0} />
      <Count label="Stopped" value={counts.stopped} />
      {counts.unknown > 0 && <Count label="Unknown" value={counts.unknown} />}
    </div>
  );
}

function Count({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: number;
  emphasize?: boolean;
}) {
  return (
    <span className={styles.count} data-emphasize={emphasize ? 'true' : 'false'}>
      <span className={styles.countValue}>{value}</span> {label}
    </span>
  );
}

function FleetSection({
  title,
  tone,
  entries,
  expandable = false,
  dataUpdatedAt,
  isQueryError,
  errorUpdatedAt,
}: {
  title: string;
  tone: 'attention' | 'calm';
  entries: FleetEntry[];
  expandable?: boolean;
  dataUpdatedAt: number;
  isQueryError: boolean;
  errorUpdatedAt: number;
}) {
  return (
    <section
      className={styles.fleetSection}
      data-tone={tone}
      aria-label={`${title} (${entries.length})`}
    >
      <h3 className={styles.sectionTitle}>
        {title} <span className={styles.sectionCount}>{entries.length}</span>
      </h3>
      <ul className={styles.rowList}>
        {entries.map((entry) => (
          <PipelineRow
            key={entry.id}
            entry={entry}
            expandable={expandable}
            dataUpdatedAt={dataUpdatedAt}
            isQueryError={isQueryError}
            errorUpdatedAt={errorUpdatedAt}
          />
        ))}
      </ul>
    </section>
  );
}

function EmptyState() {
  return (
    <div className={styles.emptyState}>
      <p>No pipelines yet.</p>
      <p className={styles.muted}>
        Pipelines are created with the CLI or a config file — this UI observes and operates them, it
        doesn’t author them. Deploy one with <code>conduit pipelines init</code> or start Conduit
        with <code>--pipelines.path</code>.
      </p>
    </div>
  );
}
