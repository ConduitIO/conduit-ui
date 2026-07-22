import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query';
import type { SchemaV1Pipeline } from '../../api/schema';
import { usePipelineOperate, type OperateQueryMeta } from './usePipelineOperate';

// Controllable stand-ins for the real start/stop mutations. Each test sets
// `startImpl`/`stopImpl` to a promise it controls the timing of, so the
// reconciliation gate (dataUpdatedAt >= mutationSettledAt) can be exercised
// deterministically against fake timers rather than a real network round trip
// (the real fetch+parse path is covered by pipelineOperate.test.ts).
const { getStartImpl, getStopImpl, setStartImpl, setStopImpl } = vi.hoisted(() => {
  let startImpl: () => Promise<void> = () => Promise.resolve();
  let stopImpl: () => Promise<void> = () => Promise.resolve();
  return {
    getStartImpl: () => startImpl,
    getStopImpl: () => stopImpl,
    setStartImpl: (fn: () => Promise<void>) => {
      startImpl = fn;
    },
    setStopImpl: (fn: () => Promise<void>) => {
      stopImpl = fn;
    },
  };
});

vi.mock('../../api/pipelineOperate', () => ({
  useStartPipeline: () => useMutation({ mutationFn: () => getStartImpl()() }),
  useStopPipeline: () => useMutation({ mutationFn: () => getStopImpl()() }),
}));

function pipeline(state: NonNullable<SchemaV1Pipeline['state']>): SchemaV1Pipeline {
  return { id: 'p1', config: { name: 'p1' }, state };
}

function meta(dataUpdatedAt: number, isError = false, errorUpdatedAt = 0): OperateQueryMeta {
  return { dataUpdatedAt, isError, errorUpdatedAt };
}

function renderOperate(initialPipeline: SchemaV1Pipeline, initialMeta: OperateQueryMeta) {
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return renderHook(
    ({ pipeline: p, query }: { pipeline: SchemaV1Pipeline; query: OperateQueryMeta }) =>
      usePipelineOperate(p, query),
    { wrapper, initialProps: { pipeline: initialPipeline, query: initialMeta } }
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  setStartImpl(() => Promise.resolve());
  setStopImpl(() => Promise.resolve());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePipelineOperate — capabilities by wire status', () => {
  it('Running: can stop, cannot start', () => {
    const { result } = renderOperate(pipeline({ status: 'STATUS_RUNNING' }), meta(0));
    expect(result.current.canStop).toBe(true);
    expect(result.current.canStart).toBe(false);
    expect(result.current.isRestart).toBe(false);
    expect(result.current.isRecovering).toBe(false);
  });

  it('Recovering: can stop (risk-flagged), cannot start', () => {
    const { result } = renderOperate(pipeline({ status: 'STATUS_RECOVERING' }), meta(0));
    expect(result.current.canStop).toBe(true);
    expect(result.current.canStart).toBe(false);
    expect(result.current.isRecovering).toBe(true);
  });

  it('Degraded: can start (as Restart), cannot stop', () => {
    const { result } = renderOperate(pipeline({ status: 'STATUS_DEGRADED' }), meta(0));
    expect(result.current.canStart).toBe(true);
    expect(result.current.canStop).toBe(false);
    expect(result.current.isRestart).toBe(true);
  });

  it('Stopped: can start (plain Start), cannot stop', () => {
    const { result } = renderOperate(
      pipeline({ status: 'STATUS_STOPPED', stoppedReason: 'STOPPED_REASON_USER' }),
      meta(0)
    );
    expect(result.current.canStart).toBe(true);
    expect(result.current.canStop).toBe(false);
    expect(result.current.isRestart).toBe(false);
  });

  it('Unspecified: neither start nor stop', () => {
    const { result } = renderOperate(pipeline({ status: 'STATUS_UNSPECIFIED' }), meta(0));
    expect(result.current.canStart).toBe(false);
    expect(result.current.canStop).toBe(false);
  });
});

describe('usePipelineOperate — Stop confirm arm/disarm', () => {
  it('armStop requires a second call (confirmStop) to actually mutate', () => {
    const { result } = renderOperate(pipeline({ status: 'STATUS_RUNNING' }), meta(0));
    act(() => result.current.armStop());
    expect(result.current.confirmingStop).toBe(true);
    expect(result.current.pendingAction).toBeNull();
  });

  it('auto-disarms after the confirm window with no confirm — no mutation fires', () => {
    const { result } = renderOperate(pipeline({ status: 'STATUS_RUNNING' }), meta(0));
    act(() => result.current.armStop());
    expect(result.current.confirmingStop).toBe(true);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.confirmingStop).toBe(false);
    expect(result.current.pendingAction).toBeNull();
  });

  it('cancelStopArm (blur/Escape) disarms immediately', () => {
    const { result } = renderOperate(pipeline({ status: 'STATUS_RUNNING' }), meta(0));
    act(() => result.current.armStop());
    act(() => result.current.cancelStopArm());
    expect(result.current.confirmingStop).toBe(false);
    expect(result.current.pendingAction).toBeNull();
  });

  it('a wire status change while armed disarms immediately (does not carry into confirm)', () => {
    const { result, rerender } = renderOperate(pipeline({ status: 'STATUS_RUNNING' }), meta(0));
    act(() => result.current.armStop());
    expect(result.current.confirmingStop).toBe(true);
    rerender({ pipeline: pipeline({ status: 'STATUS_DEGRADED', error: 'x' }), query: meta(0) });
    expect(result.current.confirmingStop).toBe(false);
  });
});

describe('usePipelineOperate — the reconciliation gate (the crux)', () => {
  it('holds the pending label through a delayed response, including a stale in-flight poll that still shows the OLD status', async () => {
    let resolveStop: (() => void) | undefined;
    setStopImpl(
      () =>
        new Promise<void>((resolve) => {
          resolveStop = resolve;
        })
    );

    const { result, rerender } = renderOperate(pipeline({ status: 'STATUS_RUNNING' }), meta(1000));

    act(() => result.current.armStop());
    // confirmStop() kicks off the mutation, but TanStack schedules the actual
    // mutationFn invocation a tick later — flush that before trying to
    // resolve/reject the controllable promise below, or `resolveStop` won't
    // exist yet.
    await act(async () => {
      result.current.confirmStop();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.pendingAction).toBe('stop');

    // A normal poll that was already in flight lands NOW, before the mutation
    // has resolved. It still reports the pre-mutation status (Running) and an
    // updated (but still pre-settle) dataUpdatedAt. Must NOT clear pending or
    // flip the label back — the mutation hasn't even settled yet.
    rerender({ pipeline: pipeline({ status: 'STATUS_RUNNING' }), query: meta(2000) });
    expect(result.current.pendingAction).toBe('stop');
    expect(result.current.displayStatus.label).toBe('Stopping…');

    // The mutation itself now resolves (StartPipeline/StopPipeline only
    // confirms the transition was ACCEPTED, not reached).
    await act(async () => {
      resolveStop?.();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.pendingAction).toBe('stop'); // still pending — no post-settle fetch yet

    // ANOTHER stale-looking update: same status, but crucially this simulates
    // a fetch that STARTED before settle and is landing right after — if a
    // naive implementation cleared pending on "any" data update rather than
    // gating on the timestamp, this would have already reverted the label by
    // now. It must not.
    rerender({ pipeline: pipeline({ status: 'STATUS_RUNNING' }), query: meta(2500) });
    expect(result.current.pendingAction).toBe('stop');
    expect(result.current.displayStatus.label).toBe('Stopping…');
  });

  it('reconciles once a fetch timestamped AFTER settle lands, and the status flips', async () => {
    let resolveStop: (() => void) | undefined;
    setStopImpl(
      () =>
        new Promise<void>((resolve) => {
          resolveStop = resolve;
        })
    );

    const { result, rerender } = renderOperate(pipeline({ status: 'STATUS_RUNNING' }), meta(1000));
    act(() => result.current.armStop());
    // confirmStop() kicks off the mutation, but TanStack schedules the actual
    // mutationFn invocation a tick later — flush that before trying to
    // resolve/reject the controllable promise below, or `resolveStop` won't
    // exist yet.
    await act(async () => {
      result.current.confirmStop();
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      resolveStop?.();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.pendingAction).toBe('stop');

    // A fetch guaranteed to have started after settle lands: dataUpdatedAt
    // is now far ahead of anything before settle, and the status has
    // actually flipped.
    rerender({
      pipeline: pipeline({ status: 'STATUS_STOPPED', stoppedReason: 'STOPPED_REASON_USER' }),
      query: meta(Date.now() + 10_000),
    });
    expect(result.current.pendingAction).toBeNull();
    expect(result.current.displayStatus.label).toBe('Stopped');
  });

  it('keeps pending and adds a connection-issue note if the post-settle reconciliation fetch errors', async () => {
    let resolveStop: (() => void) | undefined;
    setStopImpl(
      () =>
        new Promise<void>((resolve) => {
          resolveStop = resolve;
        })
    );
    const { result, rerender } = renderOperate(pipeline({ status: 'STATUS_RUNNING' }), meta(1000));
    act(() => result.current.armStop());
    // confirmStop() kicks off the mutation, but TanStack schedules the actual
    // mutationFn invocation a tick later — flush that before trying to
    // resolve/reject the controllable promise below, or `resolveStop` won't
    // exist yet.
    await act(async () => {
      result.current.confirmStop();
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      resolveStop?.();
      await vi.advanceTimersByTimeAsync(0);
    });

    rerender({ pipeline: pipeline({ status: 'STATUS_RUNNING' }), query: meta(1000, true) });
    expect(result.current.pendingAction).toBe('stop');
    expect(result.current.reconcileNote).toMatch(/connection issue/);
  });

  it('surfaces the connection-issue note even when the query was ALREADY erroring before the click (isError never toggles false→true after settle)', async () => {
    let resolveStop: (() => void) | undefined;
    setStopImpl(
      () =>
        new Promise<void>((resolve) => {
          resolveStop = resolve;
        })
    );
    // The query is already erroring (e.g. a pre-existing connectivity blip)
    // before the user ever clicks Stop — isError is `true` from the start and
    // NEVER flips (it's true before, during, and after). dataUpdatedAt is also
    // frozen (a failed fetch doesn't advance it). If the reconciliation effect
    // depended only on `dataUpdatedAt`/`isError`, it would have nothing to
    // re-run on post-settle and the note could never appear. `errorUpdatedAt`
    // (TanStack's per-failed-attempt timestamp) is what still advances here —
    // simulating the retry that happens after the mutation's onSettled
    // invalidation kicks off a refetch that ALSO fails.
    const { result, rerender } = renderOperate(
      pipeline({ status: 'STATUS_RUNNING' }),
      meta(1000, true, 500)
    );
    act(() => result.current.armStop());
    await act(async () => {
      result.current.confirmStop();
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      resolveStop?.();
      await vi.advanceTimersByTimeAsync(0);
    });

    // Same isError value as before (true), same frozen dataUpdatedAt — only
    // errorUpdatedAt moved, from the post-settle refetch's own failure.
    rerender({ pipeline: pipeline({ status: 'STATUS_RUNNING' }), query: meta(1000, true, 2000) });
    expect(result.current.pendingAction).toBe('stop');
    expect(result.current.reconcileNote).toMatch(/connection issue/);
  });

  it('adds "taking longer than expected" past the reconcile ceiling, without reverting', async () => {
    let resolveStop: (() => void) | undefined;
    setStopImpl(
      () =>
        new Promise<void>((resolve) => {
          resolveStop = resolve;
        })
    );
    const { result } = renderOperate(pipeline({ status: 'STATUS_RUNNING' }), meta(1000));
    act(() => result.current.armStop());
    // confirmStop() kicks off the mutation, but TanStack schedules the actual
    // mutationFn invocation a tick later — flush that before trying to
    // resolve/reject the controllable promise below, or `resolveStop` won't
    // exist yet.
    await act(async () => {
      result.current.confirmStop();
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      resolveStop?.();
      await vi.advanceTimersByTimeAsync(0);
    });
    act(() => {
      vi.advanceTimersByTime(16_000);
    });
    expect(result.current.pendingAction).toBe('stop');
    expect(result.current.reconcileNote).toMatch(/taking longer than expected/);
  });
});

describe('usePipelineOperate — mutation failure', () => {
  it('clears pending immediately on error and surfaces the message — never a fake success', async () => {
    setStopImpl(() => Promise.reject(new Error('failed precondition: not running')));
    const { result } = renderOperate(pipeline({ status: 'STATUS_RUNNING' }), meta(0));
    act(() => result.current.armStop());
    await act(async () => {
      result.current.confirmStop();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.pendingAction).toBeNull();
    expect(result.current.lastActionError).toMatch(/failed precondition/);
    // status itself is untouched — no fake status was ever written.
    expect(result.current.displayStatus.label).toBe('Running');
  });

  it('start() does not require confirmation and fails the same way', async () => {
    setStartImpl(() => Promise.reject(new Error('boom')));
    const { result } = renderOperate(pipeline({ status: 'STATUS_STOPPED' }), meta(0));
    await act(async () => {
      result.current.start();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.pendingAction).toBeNull();
    expect(result.current.lastActionError).toBe('boom');
  });
});

describe('usePipelineOperate — foreign-actor change (no local pendingAction)', () => {
  it('reflects a status change with no pending action of its own', () => {
    const { result, rerender } = renderOperate(pipeline({ status: 'STATUS_RUNNING' }), meta(0));
    expect(result.current.displayStatus.label).toBe('Running');
    rerender({
      pipeline: pipeline({ status: 'STATUS_STOPPED', stoppedReason: 'STOPPED_REASON_SYSTEM' }),
      query: meta(1),
    });
    expect(result.current.pendingAction).toBeNull();
    expect(result.current.displayStatus.label).toBe('Stopped (system)');
  });
});
