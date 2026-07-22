import { useEffect, useMemo, useRef, useState } from 'react';
import type { SchemaV1Record } from '../../../api/schema';
import { decodeData, formatPosition, recordPositionKey } from '../../../domain/record';
import { useDropRates } from '../../../api/dropRate';
import type { TopologyModel } from '../topology';
import { buildStageList, type Stage } from './stages';
import { useStageStreams, type StageBuffer, type StageStatus } from './useStageStreams';
import { Drawer } from './Drawer';
import styles from './RecordFlow.module.css';

const CAPACITY = 75;

// Container: derives the stage list from UI-3's topology model, owns Freeze/
// filter UI state, and wires the two live data sources (useStageStreams for
// records, useDropRates for the firehose strip). See the plan §3.6 and the
// design doc §4/§4b/§5 (AC4).
export function RecordFlow({ model, pipelineName, baseUrl }: RecordFlowProps) {
  const stages = useMemo(() => buildStageList(model), [model]);

  // The Inspect endpoints are websockets, which (unlike fetch/openapi-fetch)
  // require an *explicit* ws(s) scheme to resolve — an empty/relative baseUrl
  // resolves against the page's http(s) scheme, not ws(s), and the WebSocket
  // constructor throws a SyntaxError. `window.location.origin` always carries
  // an explicit http/https scheme, so it's the correct same-origin default
  // here even though the rest of the app is happy with baseUrl `''`.
  const wsBaseUrl = baseUrl && baseUrl.length > 0 ? baseUrl : window.location.origin;

  const [live, setLive] = useState(true);
  const [keyFilter, setKeyFilter] = useState('');
  const [keyFilterMode, setKeyFilterMode] = useState<'prefix' | 'exact'>('prefix');
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [freezeSummary, setFreezeSummary] = useState<string | undefined>(undefined);
  const freezeBaselineRef = useRef<number | undefined>(undefined);

  const buffers = useStageStreams({ stages, baseUrl: wsBaseUrl, live, capacity: CAPACITY });

  // Processor in/out stages share one componentId (the engine's drop counter
  // already sums them — see api/dropRate.ts), so dedupe before polling.
  const componentIds = useMemo(
    () => Array.from(new Set(stages.map((s) => s.componentId))),
    [stages]
  );
  const dropRates = useDropRates(wsBaseUrl, componentIds);

  const primaryStage = stages[0];
  const primaryBuffer = primaryStage ? buffers.get(primaryStage.id) : undefined;

  function toggleLive() {
    setLive((prev) => {
      const next = !prev;
      const count = primaryBuffer?.records.length ?? 0;
      if (!next) {
        // Freezing now — remember where we were so un-freezing can report how
        // much arrived while paused.
        freezeBaselineRef.current = count;
        setFreezeSummary(undefined);
      } else if (freezeBaselineRef.current !== undefined) {
        const added = count - freezeBaselineRef.current;
        setFreezeSummary(
          added > 0 ? `${added} new record${added === 1 ? '' : 's'} since freeze.` : undefined
        );
        freezeBaselineRef.current = undefined;
      }
      return next;
    });
  }

  // "F" toggles Live/Freeze, disabled while a text input has focus (so typing
  // a literal "f" into the key filter is never hijacked). Wired as an
  // imperative document listener — rather than a JSX `onKeyDown` on a wrapping
  // `<div>` — so no non-interactive element ends up carrying a keyboard
  // handler (jsx-a11y's no-static-element-interactions); the effect is scoped
  // to this component's lifetime, torn down on unmount like everything else
  // here.
  const toggleLiveRef = useRef(toggleLive);
  toggleLiveRef.current = toggleLive;
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== 'f') return;
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
      toggleLiveRef.current();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <RecordFlowContent
      pipelineName={pipelineName}
      stages={stages}
      buffers={buffers}
      capacity={CAPACITY}
      live={live}
      onToggleLive={toggleLive}
      keyFilter={keyFilter}
      onKeyFilterChange={setKeyFilter}
      keyFilterMode={keyFilterMode}
      onKeyFilterModeChange={setKeyFilterMode}
      errorsOnly={errorsOnly}
      onErrorsOnlyChange={setErrorsOnly}
      dropRates={dropRates}
      freezeSummary={freezeSummary}
    />
  );
}

export interface RecordFlowProps {
  model: TopologyModel;
  pipelineName: string;
  /** Engine base URL override (tests, or a future dev-mode remote engine). */
  baseUrl?: string;
}

export interface RecordFlowContentProps {
  pipelineName: string;
  stages: Stage[];
  buffers: Map<string, StageBuffer>;
  capacity: number;
  live: boolean;
  onToggleLive: () => void;
  keyFilter: string;
  onKeyFilterChange: (v: string) => void;
  keyFilterMode: 'prefix' | 'exact';
  onKeyFilterModeChange: (v: 'prefix' | 'exact') => void;
  errorsOnly: boolean;
  onErrorsOnlyChange: (v: boolean) => void;
  dropRates: Map<string, number | undefined>;
  freezeSummary?: string | undefined;
}

function keyDisplayText(record: SchemaV1Record): string {
  const decoded = decodeData(record.key);
  switch (decoded.kind) {
    case 'text':
      return decoded.text;
    case 'structured':
      return JSON.stringify(decoded.value);
    case 'binary':
      return `(binary, ${decoded.byteLength} bytes)`;
    case 'empty':
      return '';
  }
}

// TODO(UI-4): "errors only" has no dedicated wire signal (no per-record error
// flag). This degrades to a metadata-key convention — any metadata key whose
// name contains "error" (covers `conduit.error` and connector/processor-
// specific variants) — per the plan's §9 open question #2. If that convention
// doesn't hold in practice, this needs a real addendum, not silent expansion.
function hasErrorMetadata(record: SchemaV1Record): boolean {
  return Object.keys(record.metadata ?? {}).some((k) => k.toLowerCase().includes('error'));
}

function filterRecords(
  records: readonly SchemaV1Record[],
  opts: { keyFilter: string; keyFilterMode: 'prefix' | 'exact'; errorsOnly: boolean }
): SchemaV1Record[] {
  return records.filter((r) => {
    if (opts.errorsOnly && !hasErrorMetadata(r)) return false;
    if (opts.keyFilter.length > 0) {
      const key = keyDisplayText(r);
      const matches =
        opts.keyFilterMode === 'exact' ? key === opts.keyFilter : key.startsWith(opts.keyFilter);
      if (!matches) return false;
    }
    return true;
  });
}

function modeAnnouncement(
  live: boolean,
  status: StageStatus | undefined,
  freezeSummary: string | undefined
): string {
  const mode = live ? 'Live' : 'Frozen — inspecting without dropping the stream.';
  const statusPart =
    status === 'connecting'
      ? 'Connecting…'
      : status === 'reconnecting'
        ? 'Reconnecting…'
        : undefined;
  return [mode, statusPart, freezeSummary].filter((p): p is string => Boolean(p)).join(' ');
}

interface ConnectionBanner {
  tone: 'connecting' | 'reconnecting';
  text: string;
}

function connectionBanner(
  status: StageStatus | undefined,
  hasRecords: boolean
): ConnectionBanner | undefined {
  if (status === 'connecting' && !hasRecords) return { tone: 'connecting', text: 'Connecting…' };
  if (status === 'reconnecting') {
    return {
      tone: 'reconnecting',
      text: hasRecords ? 'Reconnecting — showing already-received records.' : 'Reconnecting…',
    };
  }
  return undefined;
}

export function RecordFlowContent(props: RecordFlowContentProps) {
  const {
    pipelineName,
    stages,
    buffers,
    capacity,
    live,
    onToggleLive,
    keyFilter,
    onKeyFilterChange,
    keyFilterMode,
    onKeyFilterModeChange,
    errorsOnly,
    onErrorsOnlyChange,
    dropRates,
    freezeSummary,
  } = props;

  const [selected, setSelected] = useState<SchemaV1Record | undefined>(undefined);

  const primaryStage = stages[0];
  const primaryBuffer = primaryStage ? buffers.get(primaryStage.id) : undefined;

  if (!primaryStage) {
    return (
      <section aria-labelledby="record-flow-heading" className={styles.section}>
        <h3 id="record-flow-heading">Live record flow</h3>
        <p className={styles.muted}>No inspectable stages in this topology yet.</p>
      </section>
    );
  }

  const records = primaryBuffer?.records ?? [];
  const filtered = filterRecords(records, { keyFilter, keyFilterMode, errorsOnly });
  const banner = connectionBanner(primaryBuffer?.status, records.length > 0);

  return (
    <section aria-labelledby="record-flow-heading" className={styles.section}>
      <h3 id="record-flow-heading">Live record flow</h3>

      <p className={styles.honestyBanner}>
        This view shows every record this UI received on the inspected connections — not a sample.
        When a stream&rsquo;s buffer fills, the server drops the newest unconsumed records for that
        component (not uniform or per-key). If you don&rsquo;t see a key, it may have been dropped
        under load, not filtered.
      </p>

      <div aria-live="polite" className={styles.srOnly}>
        {modeAnnouncement(live, primaryBuffer?.status, freezeSummary)}
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.freezeButton}
          aria-pressed={live}
          onClick={onToggleLive}
        >
          {live ? 'Freeze (F)' : 'Resume live (F)'}
        </button>

        <label>
          Key filter
          <input
            type="text"
            value={keyFilter}
            onChange={(e) => onKeyFilterChange(e.target.value)}
          />
        </label>

        <fieldset>
          <legend className={styles.srOnly}>Key filter mode</legend>
          <label>
            <input
              type="radio"
              name="key-filter-mode"
              checked={keyFilterMode === 'prefix'}
              onChange={() => onKeyFilterModeChange('prefix')}
            />
            Prefix
          </label>
          <label>
            <input
              type="radio"
              name="key-filter-mode"
              checked={keyFilterMode === 'exact'}
              onChange={() => onKeyFilterModeChange('exact')}
            />
            Exact
          </label>
        </fieldset>

        <label>
          <input
            type="checkbox"
            checked={errorsOnly}
            onChange={(e) => onErrorsOnlyChange(e.target.checked)}
          />
          Errors only
        </label>
      </div>

      {banner && (
        <p className={styles.connectionBanner} data-tone={banner.tone} role="status">
          {banner.text}
        </p>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption>
            Live records — {pipelineName} — showing last {filtered.length} of up to {capacity},{' '}
            {live ? 'Live' : 'Frozen'}
          </caption>
          <thead>
            <tr>
              <th scope="col">Operation</th>
              <th scope="col">Key</th>
              <th scope="col">Position</th>
              <th scope="col">
                <span className={styles.srOnly}>Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  {errorsOnly
                    ? 'No error-flagged records observed yet.'
                    : 'No records observed yet.'}
                </td>
              </tr>
            ) : (
              filtered.map((record, i) => (
                <RecordRow
                  key={recordPositionKey(record) ?? `idx-${i}`}
                  record={record}
                  onView={() => setSelected(record)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <DropRateStrip stages={stages} dropRates={dropRates} />

      {selected && (
        <Drawer
          record={selected}
          stages={stages}
          stageBuffers={buffers}
          onClose={() => setSelected(undefined)}
        />
      )}
    </section>
  );
}

// Each newly-appended record gets a fresh React key (recordPositionKey, or the
// index as a last resort), so a genuinely new record always mounts a brand
// new `<tr>` — the highlight-flash is therefore pure CSS (`@starting-style` in
// RecordFlow.module.css transitions the row's background from a highlight to
// transparent exactly once, on that first mount), with no JS timer/rAF
// bookkeeping needed to decide "is this row new".
function RecordRow({ record, onView }: { record: SchemaV1Record; onView: () => void }) {
  const pos = formatPosition(record.position);
  const key = keyDisplayText(record);

  return (
    <tr className={styles.row}>
      <td>{record.operation ?? 'OPERATION_UNSPECIFIED'}</td>
      <td className={styles.mono}>{key || '(none)'}</td>
      <td className={styles.mono} title={pos.full}>
        {pos.short}
      </td>
      <td>
        <button type="button" className={styles.viewButton} onClick={onView}>
          View
        </button>
      </td>
    </tr>
  );
}

function DropRateStrip({
  stages,
  dropRates,
}: {
  stages: Stage[];
  dropRates: Map<string, number | undefined>;
}) {
  const seen = new Set<string>();
  const rows: Array<{ componentId: string; label: string; rate: number; isProcessor: boolean }> =
    [];

  for (const stage of stages) {
    if (seen.has(stage.componentId)) continue;
    seen.add(stage.componentId);
    const rate = dropRates.get(stage.componentId);
    if (rate !== undefined && rate > 0) {
      rows.push({
        componentId: stage.componentId,
        label: stage.label.replace(/ \((in|out)\)$/, ''),
        rate,
        isProcessor: stage.inspectKind !== 'connector',
      });
    }
  }

  // Only shown "under a firehose" — hidden entirely when every rate is 0/undefined.
  if (rows.length === 0) return null;

  return (
    <div className={styles.dropStrip} role="status">
      {rows.map((row) => (
        <p key={row.componentId}>
          {row.label}
          {row.isProcessor ? ' (in+out combined)' : ''}: ~{row.rate.toFixed(1)} rec/sec dropped
        </p>
      ))}
    </div>
  );
}
