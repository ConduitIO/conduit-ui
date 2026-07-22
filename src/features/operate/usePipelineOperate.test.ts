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

function meta(
  dataUpdatedAt: number,
  isError = false,
  errorUpdatedAt = 0,
  isFetching = false
): OperateQueryMeta {
  return { dataUpdatedAt, isError, errorUpdatedAt, isFetching };
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

    // A normal poll was already in flight (isFetching: true) BEFORE the
    // mutation settled. Its false -> true edge happened while settledAt was
    // still null, so it can never be mistaken for a fetch that started
    // post-settle — that's the provenance check the fix relies on.
    rerender({
      pipeline: pipeline({ status: 'STATUS_RUNNING' }),
      query: meta(1000, false, 0, true),
    });
    expect(result.current.pendingAction).toBe('stop');
    expect(result.current.displayStatus.label).toBe('Stopping…');

    // The mutation itself now resolves (StartPipeline/StopPipeline only
    // confirms the transition was ACCEPTED, not reached).
    await act(async () => {
      resolveStop?.();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.pendingAction).toBe('stop'); // still pending — no post-settle fetch yet

    // That already-in-flight poll now LANDS (isFetching: true -> false),
    // reporting STALE (pre-mutation) status and a `dataUpdatedAt` that is now
    // numerically newer than settledAt. A naive implementation gating on
    // `dataUpdatedAt >= settledAt` (the review-caught bug) would revert the
    // label here. It must not: this fetch's START predates settle, so its
    // completion is ignored regardless of its timestamp or status content.
    rerender({
      pipeline: pipeline({ status: 'STATUS_RUNNING' }),
      query: meta(2000, false, 0, false),
    });
    expect(result.current.pendingAction).toBe('stop');
    expect(result.current.displayStatus.label).toBe('Stopping…');
  });

  it('reconciles once a fetch that STARTED after settle actually completes, and the status flips', async () => {
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

    // A fetch STARTS now — settledAt is already recorded, so this false ->
    // true edge proves it was issued post-mutation. Not yet complete, so
    // pending must still hold — only completion reconciles.
    rerender({
      pipeline: pipeline({ status: 'STATUS_RUNNING' }),
      query: meta(1000, false, 0, true),
    });
    expect(result.current.pendingAction).toBe('stop');
    expect(result.current.displayStatus.label).toBe('Stopping…');

    // That same fetch COMPLETES (isFetching -> false), reporting fresh,
    // flipped status.
    rerender({
      pipeline: pipeline({ status: 'STATUS_STOPPED', stoppedReason: 'STOPPED_REASON_USER' }),
      query: meta(2000, false, 0, false),
    });
    expect(result.current.pendingAction).toBeNull();
    expect(result.current.displayStatus.label).toBe('Stopped');
  });

  it('ADVERSARIAL (review-caught bug): a stale-but-late completion with dataUpdatedAt >= settledAt must NOT clear pendingAction unless a fetch genuinely started post-settle — fails against the old timestamp-only gate, passes against the fix', async () => {
    // Fixes the magnitude bug the reviewer identified in this suite: without
    // `vi.setSystemTime`, `Date.now()` (used for `mutationSettledAtRef`) stays
    // at the real epoch (~1.7e12) while this suite's meta() numbers are tiny,
    // so `dataUpdatedAt >= settledAt` was ALWAYS false by sheer magnitude —
    // never exercising the stale-but-late path the review flagged. Pinning
    // the clock makes dataUpdatedAt and settledAt directly comparable, so
    // this test is actually meaningful.
    const base = 1_700_000_000_000;
    vi.setSystemTime(base);

    let resolveStop: (() => void) | undefined;
    setStopImpl(
      () =>
        new Promise<void>((resolve) => {
          resolveStop = resolve;
        })
    );

    const { result, rerender } = renderOperate(pipeline({ status: 'STATUS_RUNNING' }), meta(base));

    act(() => result.current.armStop());
    await act(async () => {
      result.current.confirmStop();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.pendingAction).toBe('stop');

    // Settle at base + 50 (mutationSettledAtRef = Date.now() at that point).
    vi.setSystemTime(base + 50);
    await act(async () => {
      resolveStop?.();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.pendingAction).toBe('stop');

    // A poll that was ALREADY in flight before settle lands now, at
    // base + 100. Its dataUpdatedAt (base + 100) IS >= settledAt (base + 50)
    // — the OLD gate's entire condition — yet the status is STILL
    // STATUS_RUNNING (stale, pre-mutation), and `isFetching` never made a
    // false -> true transition after settle in this sequence (only its
    // completion, isFetching: false, is observed here) — so the fix's
    // provenance check correctly withholds reconciliation.
    //
    // Against the pre-fix gate (`if (query.dataUpdatedAt >= settledAt)
    // clear`), the assertions below FAIL: base + 100 >= base + 50 is true, so
    // the old code clears pendingAction and the label reverts to "Running" —
    // the exact silent revert the review caught. Against the fix, they PASS.
    vi.setSystemTime(base + 100);
    rerender({
      pipeline: pipeline({ status: 'STATUS_RUNNING' }),
      query: meta(base + 100, false, 0, false),
    });
    expect(result.current.pendingAction).toBe('stop');
    expect(result.current.displayStatus.label).toBe('Stopping…');
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

    // The post-settle reconciliation fetch starts...
    rerender({
      pipeline: pipeline({ status: 'STATUS_RUNNING' }),
      query: meta(1000, false, 0, true),
    });
    expect(result.current.pendingAction).toBe('stop');

    // ...and completes as a failure.
    rerender({
      pipeline: pipeline({ status: 'STATUS_RUNNING' }),
      query: meta(1000, true, 1500, false),
    });
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
    // NEVER flips (it's true before, during, and after). What retriggers the
    // reconciliation effect post-settle is `isFetching`'s own false -> true ->
    // false cycle (the retry attempt itself), not a change in
    // isError/errorUpdatedAt — so this scenario is exercised correctly even
    // though isError never toggles.
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

    // A retry attempt starts post-settle...
    rerender({
      pipeline: pipeline({ status: 'STATUS_RUNNING' }),
      query: meta(1000, true, 500, true),
    });
    expect(result.current.pendingAction).toBe('stop');

    // ...and fails again (same isError value as before — only errorUpdatedAt
    // and isFetching moved).
    rerender({
      pipeline: pipeline({ status: 'STATUS_RUNNING' }),
      query: meta(1000, true, 2000, false),
    });
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
