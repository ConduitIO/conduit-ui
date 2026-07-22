import { useCallback, useEffect, useRef, useState } from 'react';
import { openInspectStream, inspectURL } from '../../../api/streaming';
import type { SchemaV1Record } from '../../../api/schema';
import { recordPositionKey } from '../../../domain/record';
import type { Stage } from './stages';

export type StageStatus = 'connecting' | 'live' | 'reconnecting';

export interface StageBuffer {
  status: StageStatus;
  /** Oldest -> newest, capped at `capacity`. */
  records: SchemaV1Record[];
  /** O(1) cross-stage diff lookup by position; evicted in lockstep with `records`. */
  byPosition: Map<string, SchemaV1Record>;
  /** Malformed frames / in-band `{error}` frames seen on this stage's stream. */
  malformedFrameCount: number;
}

function emptyBuffer(): StageBuffer {
  return { status: 'connecting', records: [], byPosition: new Map(), malformedFrameCount: 0 };
}

// Ring-buffer eviction. `records.length` is capped at `capacity`; when a record
// is evicted, its position (if it had one) is removed from `byPosition` too, so
// the two structures can never disagree about what's "in" the buffer. `shift()`
// is O(capacity) but capacity is small (default 75) and this only runs once per
// incoming record, so it's not a hot-path concern.
function appendRecord(buf: StageBuffer, record: SchemaV1Record, capacity: number): void {
  buf.records.push(record);
  const key = recordPositionKey(record);
  if (key !== undefined) buf.byPosition.set(key, record);

  while (buf.records.length > capacity) {
    const evicted = buf.records.shift();
    if (evicted === undefined) break;
    const evictedKey = recordPositionKey(evicted);
    // Only delete if byPosition still points at the exact evicted object — a
    // duplicate position later in the buffer must not be clobbered here.
    if (evictedKey !== undefined && buf.byPosition.get(evictedKey) === evicted) {
      buf.byPosition.delete(evictedKey);
    }
  }
}

export interface UseStageStreamsArgs {
  stages: Stage[];
  /** http(s) base the Inspect websockets are opened against. */
  baseUrl: string;
  /** false = Freeze: buffers keep growing, but nothing forces a re-render. */
  live: boolean;
  /** Ring-buffer capacity per stage. */
  capacity?: number;
  /** Injectable for tests; defaults to the real transport. */
  openStream?: typeof openInspectStream;
}

/**
 * Owns one websocket per stage for as long as the stage list + baseUrl are
 * unchanged — opened together on mount, torn down together on unmount or on a
 * stage-set/baseUrl change (topology change, pipeline switch). See the plan's
 * §3.5/§7: this is the one hook responsible for the freeze-doesn't-drop-the-
 * stream invariant, reconnect-on-close-only, and the ring buffer.
 *
 * Buffers live in a ref, not React state: an incoming record always mutates the
 * buffer, but only triggers a re-render when `live` is true. Connection-status
 * transitions (connecting/live/reconnecting) always trigger a re-render
 * regardless of `live` — Freeze pauses new-ROW churn, not visibility into
 * whether a stage's stream is currently up.
 */
export function useStageStreams({
  stages,
  baseUrl,
  live,
  capacity = 75,
  openStream = openInspectStream,
}: UseStageStreamsArgs): Map<string, StageBuffer> {
  // JSON.stringify rather than a delimiter-joined string: stage ids come from
  // connector/processor ids the engine controls, and while a literal `|` in
  // one is exceedingly unlikely today, a delimiter join can't rule it out —
  // this can't collide.
  const stagesKey = JSON.stringify(stages.map((s) => s.id));

  // Read inside the effect via `.current` so the effect's dependency list can
  // stay `[stagesKey, baseUrl, ...]` (ids only) rather than the `stages` array
  // reference, which changes on every parent render even when the id set
  // doesn't — refs are exempt from exhaustive-deps, so no lint suppression
  // is needed for this intentional divergence from "list every value used".
  const stagesRef = useRef(stages);
  stagesRef.current = stages;

  const liveRef = useRef(live);
  liveRef.current = live;

  const buffersRef = useRef<Map<string, StageBuffer>>(new Map());
  const [, setTick] = useState(0);
  const forceRender = useCallback(() => setTick((t) => t + 1), []);

  // live: false -> true fires one immediate catch-up render (the buffer never
  // stopped growing while frozen; this just paints the backlog in one paint).
  const prevLiveRef = useRef(live);
  useEffect(() => {
    if (live && !prevLiveRef.current) forceRender();
    prevLiveRef.current = live;
  }, [live, forceRender]);

  useEffect(() => {
    const currentStages = stagesRef.current;

    const nextBuffers = new Map<string, StageBuffer>();
    for (const stage of currentStages) nextBuffers.set(stage.id, emptyBuffer());
    buffersRef.current = nextBuffers;
    forceRender();

    // Opens one stage's Inspect stream and owns its private reconnect state
    // (attempt count, backoff timer, and a "generation" counter). Generation
    // guards against a late callback from a socket that's already been
    // superseded by a newer `connect()` call for the same stage — without it,
    // a stray message/close event from a stale socket could resurrect a status
    // we've already moved past, or double-append a record.
    function startStage(stage: Stage): () => void {
      let closed = false;
      let attempt = 0;
      let generation = 0;
      let closeSocket: (() => void) | undefined;
      let backoffTimer: ReturnType<typeof setTimeout> | undefined;

      const connect = () => {
        if (closed) return;
        const myGeneration = ++generation;
        // Distinct from `generation`: guards against a stray callback firing
        // on THIS SAME socket after ITS OWN onClose already ran but before the
        // next `connect()` call has happened (so `myGeneration === generation`
        // would otherwise still be true and let it through).
        let socketClosed = false;
        const isStale = () => closed || socketClosed || myGeneration !== generation;

        const buf = buffersRef.current.get(stage.id);
        if (buf) buf.status = attempt === 0 ? 'connecting' : 'reconnecting';
        forceRender();

        const url = inspectURL(baseUrl, stage.inspectKind, stage.componentId);
        closeSocket = openStream<SchemaV1Record>(
          url,
          (record) => {
            if (isStale()) return;
            const b = buffersRef.current.get(stage.id);
            if (!b) return;
            b.status = 'live';
            appendRecord(b, record, capacity);
            if (liveRef.current) forceRender();
          },
          {
            onError: () => {
              if (isStale()) return;
              const b = buffersRef.current.get(stage.id);
              if (b) b.malformedFrameCount += 1;
            },
            onClose: () => {
              if (isStale()) return;
              socketClosed = true;
              const b = buffersRef.current.get(stage.id);
              if (b) b.status = 'reconnecting';
              forceRender();
              const delay = Math.min(500 * 2 ** attempt, 15000);
              attempt += 1;
              backoffTimer = setTimeout(() => {
                if (!closed) connect();
              }, delay);
            },
          }
        );
      };

      connect();

      return () => {
        closed = true;
        if (backoffTimer !== undefined) clearTimeout(backoffTimer);
        closeSocket?.();
      };
    }

    const teardowns = currentStages.map(startStage);

    return () => {
      for (const teardown of teardowns) teardown();
    };
  }, [stagesKey, baseUrl, capacity, openStream, forceRender]);

  return buffersRef.current;
}
