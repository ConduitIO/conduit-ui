import { useId, type KeyboardEvent } from 'react';
import type { SchemaV1Pipeline } from '../../api/schema';
import { usePipelineOperate, type OperateQueryMeta } from './usePipelineOperate';
import styles from './OperateControls.module.css';

export interface OperateControlsProps {
  pipeline: SchemaV1Pipeline;
  /**
   * Metadata of the query that supplies `pipeline` — the fleet list query on a
   * fleet row, the per-id detail query on the detail page. Required so the
   * reconciliation gate in usePipelineOperate compares against the right
   * fetch's timestamp (see usePipelineOperate's doc comment).
   */
  query: OperateQueryMeta;
}

// Shared start/stop control, used by both the fleet row and the detail header
// so the operate treatment can't drift between them (mirrors StatusPill).
// Renders by WIRE status, not by pendingAction — see usePipelineOperate: this
// keeps the control type (Start/Restart/Stop) stable through an in-flight
// action, only the label and disabled state change.
export function OperateControls({ pipeline, query }: OperateControlsProps) {
  const op = usePipelineOperate(pipeline, query);
  const tooltipId = useId();

  if (!op.canStart && !op.canStop) {
    // STATUS_UNSPECIFIED (a future/older server) — no operable control, but a
    // lingering error from a prior attempt on this pipeline still shows.
    return op.lastActionError ? (
      <div className={styles.controls}>
        <ErrorNote message={op.lastActionError} />
      </div>
    ) : null;
  }

  const handleStopClick = () => {
    if (op.confirmingStop) op.confirmStop();
    else op.armStop();
  };
  const handleStopKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Escape' && op.confirmingStop) {
      e.preventDefault();
      op.cancelStopArm();
    }
  };
  const handleStopBlur = () => {
    if (op.confirmingStop) op.cancelStopArm();
  };

  return (
    <div className={styles.controls}>
      {op.canStop ? (
        <StopButton
          op={op}
          tooltipId={tooltipId}
          onClick={handleStopClick}
          onKeyDown={handleStopKeyDown}
          onBlur={handleStopBlur}
        />
      ) : (
        <StartButton op={op} />
      )}

      {op.isRecovering && op.canStop && (
        <span id={tooltipId} role="tooltip" className={styles.tooltip}>
          This pipeline is auto-recovering. Stopping now interrupts the recovery backoff loop rather
          than racing a data-path operation — safe, but stops the engine’s own retry.
        </span>
      )}

      {op.isRestart && op.canStart && op.pendingAction === null && (
        <p className={styles.restartNote}>Restarts from the last committed position.</p>
      )}

      {/* One-shot announcements for arm/cancel — never per-poll-tick spam. */}
      <span className={styles.srOnly} aria-live="polite">
        {op.stopArmAnnouncement}
      </span>

      {op.reconcileNote && (
        <span className={styles.reconcileNote} role="status">
          ({op.reconcileNote})
        </span>
      )}

      {op.lastActionError && <ErrorNote message={op.lastActionError} />}
    </div>
  );
}

function StopButton({
  op,
  tooltipId,
  onClick,
  onKeyDown,
  onBlur,
}: {
  op: ReturnType<typeof usePipelineOperate>;
  tooltipId: string;
  onClick: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
  onBlur: () => void;
}) {
  const label = stopLabel(op);
  return (
    <button
      type="button"
      className={styles.stopButton}
      data-armed={op.confirmingStop ? 'true' : 'false'}
      data-recovering={op.isRecovering ? 'true' : 'false'}
      disabled={op.isBusy}
      aria-label={stopAriaLabel(op)}
      {...(op.isRecovering ? { 'aria-describedby': tooltipId } : {})}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    >
      {label}
    </button>
  );
}

// Visible text stays short (fits the fleet row); the accessible name spells
// out "pipeline" since a screen reader user tabbing through a list of rows
// hears the name out of visual context — "Stop" repeated N times is useless,
// "Stop pipeline" (per row) is not.
function stopLabel(op: ReturnType<typeof usePipelineOperate>): string {
  if (op.pendingAction === 'stop') return 'Stopping…';
  if (op.confirmingStop)
    return op.isRecovering ? 'Recovering — click again to force stop' : 'Click again to confirm';
  return 'Stop';
}

function stopAriaLabel(op: ReturnType<typeof usePipelineOperate>): string {
  if (op.pendingAction === 'stop') return 'Stopping pipeline';
  if (op.confirmingStop) {
    return op.isRecovering
      ? 'Recovering — click again to force stop pipeline'
      : 'Click again to confirm stop pipeline';
  }
  return 'Stop pipeline';
}

function StartButton({ op }: { op: ReturnType<typeof usePipelineOperate> }) {
  const label = startLabel(op);
  return (
    <button
      type="button"
      className={styles.startButton}
      disabled={op.isBusy}
      aria-label={startAriaLabel(op)}
      onClick={op.start}
    >
      {label}
    </button>
  );
}

function startLabel(op: ReturnType<typeof usePipelineOperate>): string {
  if (op.pendingAction === 'start') return op.isRestart ? 'Restarting…' : 'Starting…';
  return op.isRestart ? 'Restart' : 'Start';
}

function startAriaLabel(op: ReturnType<typeof usePipelineOperate>): string {
  return `${startLabel(op)} pipeline`;
}

function ErrorNote({ message }: { message: string }) {
  return (
    <span className={styles.errorNote} role="alert">
      {message}
    </span>
  );
}
