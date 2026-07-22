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
 * `isFetching` (and `isError`) come from that same query — the one whose
 * fetch cycle eventually flips `pipeline.state.status`.
 */
export interface OperateQueryMeta {
  /**
   * Epoch ms of the query's most recent successful fetch. Informational only
   * — kept for callers/consumers that want it, but NOT used to gate
   * reconciliation below (see `isFetching`'s doc comment for why a completion
   * timestamp alone is unsafe for that).
   */
  dataUpdatedAt: number;
  /** True while the query's most recent fetch attempt failed. */
  isError: boolean;
  /**
   * Epoch ms of the query's most recent FAILED fetch attempt (TanStack's
   * `errorUpdatedAt`). Informational only, same caveat as `dataUpdatedAt`.
   */
  errorUpdatedAt: number;
  /**
   * True while the query's most recent fetch attempt is in flight (TanStack's
   * `isFetching`, i.e. `fetchStatus === 'fetching'`). This — not
   * `dataUpdatedAt` — is what the reconciliation effect below gates on: it
   * watches for this flipping false -> true AFTER the mutation settles, which
   * proves a fetch genuinely STARTED post-mutation, then waits for that same
   * fetch to complete (true -> false) before trusting its result. A poll
   * already in flight when the user clicks Stop flips false -> true BEFORE
   * settle, so its later completion is correctly ignored even though it can
   * still land (with stale, pre-mutation data) after the mutation resolves —
   * the bug a plain `dataUpdatedAt >= settledAt` completion-timestamp
   * comparison could not distinguish from a genuine post-settle fetch.
   */
  isFetching: boolean;
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
 * crux is the reconciliation effect below: `pendingAction` clears only once a
 * fetch attempt that genuinely STARTED after the mutation settled has also
 * COMPLETED — gated on `query.isFetching`'s false -> true -> false cycle
 * relative to `mutationSettledAtRef`, not on comparing completion timestamps.
 *
 * That distinction matters because a normal 3s poll can already be in flight
 * when the user confirms Stop; that poll still carries pre-mutation data
 * (e.g. STATUS_RUNNING) and can COMPLETE after the mutation resolves, with a
 * `dataUpdatedAt` newer than `mutationSettledAt` even though the fetch itself
 * started before the mutation was even sent. A completion-timestamp
 * comparison (`dataUpdatedAt >= settledAt`) cannot tell that apart from a
 * genuine post-settle fetch, and clearing `pendingAction` on it would flip
 * the label back to "Running" for a moment even though the stop is still
 * genuinely in progress — a silent, confusing revert, and exactly the bug
 * this hook exists to prevent.
 *
 * Watching `isFetching`'s START edge instead closes that gap: a fetch already
 * in flight when the mutation settles never produces a false -> true
 * transition afterwards, so its later completion is correctly ignored. Only a
 * fetch whose start we can prove happened after `mutationSettledAtRef` is
 * trusted, and only once IT completes (its own false -> true -> false cycle)
 * do we act on `query.isError` at that moment to decide reconcile-success vs.
 * a connection-issue note. Status content is never consulted for this
 * decision — a legitimate no-op (e.g. Stop confirming a pipeline that somehow
 * reports the same status) must still reconcile, so gating is purely on fetch
 * provenance, never on "did the status value change."
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
  // True once we've observed a fetch attempt whose START (isFetching
  // false -> true) happened while `mutationSettledAtRef` was already set —
  // i.e. a fetch guaranteed to have been issued after the mutation settled.
  // Only THIS fetch's own completion is trusted to reconcile `pendingAction`;
  // see the function doc comment above.
  const genuineFetchInFlightRef = useRef(false);
  // Previous `query.isFetching`, so the effect below can detect edges
  // (false -> true, true -> false) instead of re-acting on every render that
  // merely repeats the same value.
  const prevIsFetchingRef = useRef(query.isFetching);

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
  // Only applies once the mutation has settled (`mutationSettledAtRef.current
  // !== null`); before that, nothing the query reports says anything about
  // the mutation's own outcome yet.
  //
  // `query.isFetching`'s own false -> true -> false cycle is what reliably
  // re-triggers this effect on every fetch attempt (initial, background poll,
  // or the invalidate-triggered refetch), including a repeated,
  // identical-looking failure — no need for `errorUpdatedAt` as a separate
  // dependency the way the previous (buggy) version required.
  useEffect(() => {
    const settledAt = mutationSettledAtRef.current;
    const wasFetching = prevIsFetchingRef.current;
    const isFetching = query.isFetching;
    prevIsFetchingRef.current = isFetching;

    if (pendingAction === null || settledAt === null) return;

    // A fetch attempt starting NOW, with settledAt already recorded, is
    // guaranteed to have been issued after the mutation settled — mark it so
    // its completion (below) can be trusted. A fetch already in flight BEFORE
    // settle never produces this edge (it was already `true` when settledAt
    // was set), so its eventual completion is correctly left untouched by
    // this branch — that's the fix for the stale in-flight-poll bug.
    if (isFetching && !wasFetching) {
      genuineFetchInFlightRef.current = true;
      return;
    }

    // Only react to the completion of a fetch we know started post-settle.
    if (!isFetching && wasFetching && genuineFetchInFlightRef.current) {
      genuineFetchInFlightRef.current = false;
      if (query.isError) {
        setReconcileNote('confirming — connection issue');
        return;
      }
      setPendingAction(null);
      setReconcileNote(undefined);
      mutationSettledAtRef.current = null;
      clearCeilingTimer();
    }
  }, [query.isFetching, query.isError, pendingAction, clearCeilingTimer]);

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
      genuineFetchInFlightRef.current = false;
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
      genuineFetchInFlightRef.current = false;
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
