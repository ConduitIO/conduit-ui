import { useCallback, useEffect, useRef, useState } from 'react';
import type { SchemaV1Pipeline, SchemaV1PipelineStatus } from '../../api/schema';
import { useStartPipeline, useStopPipeline } from '../../api/pipelineOperate';
import { describePipelineStatus, type PipelineDisplayStatus } from '../../domain/pipelineStatus';

// How long an armed Stop confirmation stays live before auto-disarming.
const CONFIRM_WINDOW_MS = 4000;
// After this long still pending post-settle, add reassurance copy (never revert).
const RECONCILE_CEILING_MS = 15000;

export type PendingAction = 'start' | 'stop' | null;

/**
 * The subset of a TanStack `UseQueryResult` this hook needs from the query that
 * supplies `pipeline` — NOT necessarily the query that triggered the mutation.
 * Callers must pass the metadata of whichever query drives the `pipeline` prop
 * they're rendering (the fleet list query on a fleet row, the per-id detail
 * query on the detail page): the reconciliation gate below only holds if
 * `dataUpdatedAt` is a timestamp from the same query whose data eventually
 * flips `pipeline.state.status`.
 */
export interface OperateQueryMeta {
  /** Epoch ms of the query's most recent successful fetch. */
  dataUpdatedAt: number;
  /** True while the query's most recent fetch attempt failed. */
  isError: boolean;
  /**
   * Epoch ms of the query's most recent FAILED fetch attempt (TanStack's
   * `errorUpdatedAt`). Required as its own field — not derivable from
   * `isError` — because a pre-existing outage (isError already `true` before
   * the user clicks, and staying `true` after) never toggles, and a failed
   * fetch never advances `dataUpdatedAt` either. Without a value that changes
   * on every attempt (even repeated identical-looking failures), the
   * reconciliation effect below would have nothing to re-run on and the
   * "connection issue" note could silently never appear during a standing
   * outage. Default to 0 if the caller has no better value.
   */
  errorUpdatedAt: number;
}

export interface UsePipelineOperateResult {
  /** describePipelineStatus(...), overridden with a transient pending label —
   *  this overlay never gets written back into the query cache or domain layer. */
  displayStatus: PipelineDisplayStatus;
  pendingAction: PendingAction;
  confirmingStop: boolean;
  /** True when the wire status supports Start/Restart right now. */
  canStart: boolean;
  /** True when the wire status supports Stop right now. */
  canStop: boolean;
  /** Degraded: repair = restart (StartPipeline on a degraded pipeline). */
  isRestart: boolean;
  /** Recovering: Stop is risk-flagged, not disabled (§6 — flagged for sign-off). */
  isRecovering: boolean;
  /** True while a mutation or the post-settle reconciliation fetch is in flight
   *  (drives `disabled` on whichever control is shown). */
  isBusy: boolean;
  start: () => void;
  armStop: () => void;
  confirmStop: () => void;
  cancelStopArm: () => void;
  /** Visually-hidden aria-live announcement text for arm/cancel (Stop only). */
  stopArmAnnouncement: string;
  /** Set on mutation failure; cleared on the next attempt. Never a fake success. */
  lastActionError: string | undefined;
  /** Reassurance copy while pending: a connection issue on the reconciliation
   *  fetch, or "taking longer than expected" past the ceiling. Never "reverted". */
  reconcileNote: string | undefined;
}

function statusOf(pipeline: SchemaV1Pipeline | undefined): SchemaV1PipelineStatus {
  return pipeline?.state?.status ?? 'STATUS_UNSPECIFIED';
}

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return 'Unknown error';
}

/**
 * The optimistic-window + multi-actor reconciliation state machine for
 * operate (start/stop). See docs/design-documents for the full writeup; the
 * crux is the reconciliation effect below: `pendingAction` clears only when
 * `query.dataUpdatedAt >= mutationSettledAt`, a timestamp comparison rather
 * than a status comparison. That distinction matters because a normal 3s poll
 * can already be in flight when the user confirms Stop; that poll still
 * carries pre-mutation data (e.g. STATUS_RUNNING) and can land AFTER the
 * mutation resolves. Clearing `pendingAction` on that stale response — because
 * "data changed" or "a fetch happened" — would flip the label back to
 * "Running" for a moment even though the stop is still genuinely in progress:
 * a silent, confusing revert. Gating on the fetch's timestamp instead of its
 * content guarantees we only reconcile against a fetch that is guaranteed to
 * have started after the mutation genuinely completed.
 */
export function usePipelineOperate(
  pipeline: SchemaV1Pipeline | undefined,
  query: OperateQueryMeta
): UsePipelineOperateResult {
  const id = pipeline?.id ?? '';
  const startMutation = useStartPipeline(id);
  const stopMutation = useStopPipeline(id);

  const [confirmingStop, setConfirmingStop] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [lastActionError, setLastActionError] = useState<string | undefined>(undefined);
  const [reconcileNote, setReconcileNote] = useState<string | undefined>(undefined);
  const [stopArmAnnouncement, setStopArmAnnouncement] = useState('');

  // Refs: these gate the reconciliation effect but shouldn't themselves cause a
  // render (they're read inside effects/handlers driven by other state changes).
  const mutationSettledAtRef = useRef<number | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ceilingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const status = statusOf(pipeline);

  const clearConfirmTimer = useCallback(() => {
    if (confirmTimerRef.current !== null) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
  }, []);

  const clearCeilingTimer = useCallback(() => {
    if (ceilingTimerRef.current !== null) {
      clearTimeout(ceilingTimerRef.current);
      ceilingTimerRef.current = null;
    }
  }, []);

  // §9 edge case: if the wire status changes while Stop is armed but not yet
  // confirmed, disarm immediately — confirming would act on a status the
  // control no longer reflects.
  const prevStatusRef = useRef(status);
  useEffect(() => {
    if (confirmingStop && prevStatusRef.current !== status) {
      setConfirmingStop(false);
      clearConfirmTimer();
      setStopArmAnnouncement('Stop cancelled — pipeline status changed.');
    }
    prevStatusRef.current = status;
  }, [status, confirmingStop, clearConfirmTimer]);

  // The reconciliation gate (the crux — see the function doc comment above).
  // Both branches only apply once the mutation has settled
  // (`mutationSettledAtRef.current !== null`); before that, a query error or a
  // stale dataUpdatedAt says nothing about the mutation's own outcome.
  //
  // `query.errorUpdatedAt` (not `query.isError`) is the dependency that makes
  // the connection-issue branch reliable: a connectivity problem that already
  // existed BEFORE the click — `isError` already `true`, staying `true` after
  // — never toggles, and a failed fetch never advances `dataUpdatedAt` either.
  // With neither in the dependency array changing value, this effect would
  // have nothing to re-run on, and the note could silently never appear
  // during a standing outage. `errorUpdatedAt` advances on every failed
  // attempt (even a repeated, identical-looking one), so it's the signal that
  // reliably re-triggers this check.
  useEffect(() => {
    const settledAt = mutationSettledAtRef.current;
    if (pendingAction === null || settledAt === null) return;
    if (query.dataUpdatedAt >= settledAt) {
      setPendingAction(null);
      setReconcileNote(undefined);
      mutationSettledAtRef.current = null;
      clearCeilingTimer();
    } else if (query.isError) {
      setReconcileNote('confirming — connection issue');
    }
  }, [query.dataUpdatedAt, query.errorUpdatedAt, query.isError, pendingAction, clearCeilingTimer]);

  useEffect(
    () => () => {
      clearConfirmTimer();
      clearCeilingTimer();
    },
    [clearConfirmTimer, clearCeilingTimer]
  );

  const beginPending = useCallback(
    (action: 'start' | 'stop') => {
      setLastActionError(undefined);
      setReconcileNote(undefined);
      mutationSettledAtRef.current = null;
      setPendingAction(action);
      clearCeilingTimer();
      ceilingTimerRef.current = setTimeout(() => {
        setReconcileNote((note) => note ?? 'taking longer than expected');
      }, RECONCILE_CEILING_MS);
    },
    [clearCeilingTimer]
  );

  // On error: clear pending immediately and surface the real error. This is
  // NOT a "revert" — the action never took effect, so the still-current status
  // is simply what's shown; no fake success, no fake status was ever written.
  const failPending = useCallback(
    (err: unknown) => {
      setPendingAction(null);
      mutationSettledAtRef.current = null;
      clearCeilingTimer();
      setLastActionError(errorMessage(err));
    },
    [clearCeilingTimer]
  );

  // On success: the mutation itself only confirms the transition was ACCEPTED.
  // `pendingAction` stays set until the reconciliation effect above confirms a
  // post-settle fetch landed.
  const settlePending = useCallback(() => {
    mutationSettledAtRef.current = Date.now();
  }, []);

  const start = useCallback(() => {
    if (pendingAction !== null) return;
    beginPending('start');
    startMutation.mutate(undefined, { onError: failPending, onSuccess: settlePending });
  }, [pendingAction, startMutation, beginPending, failPending, settlePending]);

  const armStop = useCallback(() => {
    if (pendingAction !== null) return;
    setConfirmingStop(true);
    clearConfirmTimer();
    setStopArmAnnouncement('Stop requires confirmation. Click Stop again within a few seconds.');
    confirmTimerRef.current = setTimeout(() => {
      setConfirmingStop(false);
      confirmTimerRef.current = null;
      setStopArmAnnouncement('Stop cancelled.');
    }, CONFIRM_WINDOW_MS);
  }, [pendingAction, clearConfirmTimer]);

  const cancelStopArm = useCallback(() => {
    const wasArmed = confirmingStop;
    setConfirmingStop(false);
    clearConfirmTimer();
    if (wasArmed) setStopArmAnnouncement('Stop cancelled.');
  }, [confirmingStop, clearConfirmTimer]);

  const confirmStop = useCallback(() => {
    if (pendingAction !== null) return;
    setConfirmingStop(false);
    clearConfirmTimer();
    setStopArmAnnouncement('');
    beginPending('stop');
    stopMutation.mutate(undefined, { onError: failPending, onSuccess: settlePending });
  }, [pendingAction, stopMutation, clearConfirmTimer, beginPending, failPending, settlePending]);

  const baseDisplay = describePipelineStatus(pipeline?.state);
  const displayStatus: PipelineDisplayStatus =
    pendingAction === null
      ? baseDisplay
      : {
          ...baseDisplay,
          label: pendingAction === 'start' ? 'Starting…' : 'Stopping…',
          tone: 'recovering',
        };

  // Capability flags are wire-status-only (NOT gated on pendingAction) so the
  // control TYPE (Start/Restart/Stop) stays stable while pending — only its
  // label/disabled state changes. Gating these on pendingAction would make the
  // control disappear mid-action instead of showing "Stopping…"/"Starting…".
  const canStart = status === 'STATUS_DEGRADED' || status === 'STATUS_STOPPED';
  const canStop = status === 'STATUS_RUNNING' || status === 'STATUS_RECOVERING';

  return {
    displayStatus,
    pendingAction,
    confirmingStop,
    canStart,
    canStop,
    isRestart: status === 'STATUS_DEGRADED',
    isRecovering: status === 'STATUS_RECOVERING',
    isBusy: pendingAction !== null || startMutation.isPending || stopMutation.isPending,
    start,
    armStop,
    confirmStop,
    cancelStopArm,
    stopArmAnnouncement,
    lastActionError,
    reconcileNote,
  };
}
