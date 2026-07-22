import {
  formatRecordsPerSec,
  SLOW_LATENCY_THRESHOLD_SECONDS,
  type PipelineActivitySummary,
} from './nodeMetrics';
import styles from './PipelineActivityBadge.module.css';

const LABEL: Record<PipelineActivitySummary['activity'], string> = {
  flowing: 'Flowing',
  idle: 'Idle — no recent activity',
  unknown: '',
};

/**
 * Pipeline-level activity readout: the always-on "at a glance" summary, and the
 * fallback for fan-in/fan-out pipelines where individual node badges in
 * TopologyGraph are ambiguous (see nodeMetrics.ts).
 *
 * Only rendered while the pipeline is Running — AC5 explicitly scopes "idle" to
 * that case, and showing it for a Stopped/Degraded/Recovering pipeline would be a
 * second, redundant (and potentially confusing) signal on top of the existing
 * status badge. Never renders a "stalled" state: there is no wire signal that
 * distinguishes a genuinely idle pipeline from one blocked mid-read/write (see the
 * UI-5 plan's scope decision) — `unknown` (first poll, or metrics unreachable) also
 * renders nothing rather than guessing.
 */
export function PipelineActivityBadge({
  summary,
  running,
}: {
  summary: PipelineActivitySummary;
  running: boolean;
}) {
  if (!running || summary.activity === 'unknown') return null;

  return (
    <div className={styles.badge} data-activity={summary.activity} role="status">
      <span className={styles.label}>{LABEL[summary.activity]}</span>
      {summary.activity === 'flowing' && summary.recordsPerSec !== undefined && (
        <span className={styles.rate}>{formatRecordsPerSec(summary.recordsPerSec)}</span>
      )}
      {summary.slow && (
        <span
          className={styles.tag}
          title={`p95 write latency above ${SLOW_LATENCY_THRESHOLD_SECONDS}s`}
        >
          slow
        </span>
      )}
      {summary.ambiguousDestinationCount !== undefined && (
        <span className={styles.tag}>
          combined across {summary.ambiguousDestinationCount} destinations
        </span>
      )}
    </div>
  );
}
