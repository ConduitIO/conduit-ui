import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import type { SchemaV1Record } from '../../../api/schema';
import {
  decodeData,
  flattenRecord,
  formatPosition,
  recordPositionKey,
} from '../../../domain/record';
import {
  diffRecords,
  changedOnly,
  type FieldDiff,
  type FieldDiffKind,
} from '../../../domain/recordDiff';
import { tokenizeJson, type JsonToken } from '../../../domain/jsonHighlight';
import type { Stage } from './stages';
import type { StageBuffer } from './useStageStreams';
import styles from './Drawer.module.css';

// Display-only truncation for very large payloads. This NEVER truncates what
// feeds the diff (diffRecords always runs against the full flattened record;
// only the raw text/JSON preview shown here is capped) — see the plan §3.7 and
// invariant-adjacent note in record.ts about absent vs. truncated data.
const DISPLAY_CAP_CHARS = 8 * 1024;

export interface DrawerProps {
  record: SchemaV1Record;
  /** Authoritative execution order (from stages.ts), never arrival order. */
  stages: Stage[];
  stageBuffers: Map<string, StageBuffer>;
  onClose: () => void;
}

type StageDiffRow =
  | { stage: Stage; kind: 'not-observed' }
  | { stage: Stage; kind: 'baseline' }
  | { stage: Stage; kind: 'diff'; diffs: FieldDiff[] };

/**
 * Walks `stages` in execution order, looking up this record's position in each
 * stage's buffer. A stage with no entry at that position is "not-observed" —
 * rendered as a gap, never mistaken for "removed". Two distinct situations
 * collapse into that one gap state, and the UI copy is deliberately honest
 * about not being able to tell them apart: the record genuinely hasn't
 * reached that stage yet (the common case for a fast-arriving record), OR it
 * passed through but has since aged out of that stage's capacity-bounded ring
 * buffer (see useStageStreams.ts's `appendRecord`) — under a firehose, a
 * stage further down the pipeline may still be receiving live traffic and
 * evict this position before the drawer is opened. The first stage that DID
 * see it has no predecessor to diff against ("baseline"); every stage after
 * that diffs against the most recent *observed* stage (skipping gaps in the
 * pairwise walk, per the plan §4 point 3).
 */
function buildStageDiffRows(
  record: SchemaV1Record,
  stages: Stage[],
  stageBuffers: Map<string, StageBuffer>
): StageDiffRow[] {
  const posKey = recordPositionKey(record);
  const rows: StageDiffRow[] = [];
  let prevFlat: Map<string, string> | undefined;

  for (const stage of stages) {
    const observed =
      posKey !== undefined ? stageBuffers.get(stage.id)?.byPosition.get(posKey) : undefined;
    if (!observed) {
      rows.push({ stage, kind: 'not-observed' });
      continue;
    }
    const flat = flattenRecord(observed);
    if (!prevFlat) {
      rows.push({ stage, kind: 'baseline' });
    } else {
      rows.push({ stage, kind: 'diff', diffs: diffRecords(prevFlat, flat) });
    }
    prevFlat = flat;
  }

  return rows;
}

function glyphFor(kind: FieldDiffKind): string {
  switch (kind) {
    case 'added':
      return '+';
    case 'removed':
      return '−'; // minus sign, not a hyphen — visually distinct at small sizes
    case 'changed':
      return '~';
    case 'unchanged':
      return '=';
  }
}

function FieldDiffRow({ diff }: { diff: FieldDiff }) {
  return (
    <li data-diff-kind={diff.kind}>
      <span className={styles.diffGlyph} aria-hidden="true">
        {glyphFor(diff.kind)}
      </span>
      <span>{diff.kind}</span> <span className={styles.diffPath}>{diff.path}</span>
      {diff.kind === 'changed' && (
        <>
          {' '}
          <span className={styles.diffValue}>{diff.before}</span> &rarr;{' '}
          <span className={styles.diffValue}>{diff.after}</span>
        </>
      )}
      {diff.kind === 'added' && (
        <>
          {' '}
          <span className={styles.diffValue}>{diff.after}</span>
        </>
      )}
      {(diff.kind === 'removed' || diff.kind === 'unchanged') && (
        <>
          {' '}
          <span className={styles.diffValue}>{diff.before}</span>
        </>
      )}
    </li>
  );
}

function StageDiffSection({
  rows,
  showUnchanged,
}: {
  rows: StageDiffRow[];
  showUnchanged: boolean;
}) {
  return (
    <ol className={styles.stageDiffList}>
      {rows.map((row) => (
        <li key={row.stage.id} className={styles.stageDiffItem} data-kind={row.kind}>
          <span className={styles.stageDiffLabel}>{row.stage.label}</span>
          {row.kind === 'not-observed' && (
            <span className={styles.notObserved}>
              not observed at this stage yet — or it aged out of this stage&rsquo;s buffer
            </span>
          )}
          {row.kind === 'baseline' && <span className={styles.baselineTag}>baseline</span>}
          {row.kind === 'diff' && (
            <ul className={styles.fieldDiffList}>
              {(showUnchanged ? row.diffs : changedOnly(row.diffs)).map((d) => (
                <FieldDiffRow key={d.path} diff={d} />
              ))}
              {(showUnchanged ? row.diffs : changedOnly(row.diffs)).length === 0 && (
                <li>No field changes at this stage.</li>
              )}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}

function HighlightedTokens({
  tokens,
  charLimit,
}: {
  tokens: JsonToken[];
  charLimit?: number | undefined;
}) {
  const nodes: ReactNode[] = [];
  let consumed = 0;
  for (const [i, t] of tokens.entries()) {
    if (charLimit !== undefined && consumed >= charLimit) break;
    let text = t.text;
    if (charLimit !== undefined && consumed + text.length > charLimit) {
      text = text.slice(0, charLimit - consumed);
    }
    consumed += text.length;
    nodes.push(
      <span key={i} className={styles.token} data-kind={t.kind}>
        {text}
      </span>
    );
  }
  return <>{nodes}</>;
}

function PayloadBlock({
  title,
  decoded,
}: {
  title: string;
  decoded: ReturnType<typeof decodeData>;
}) {
  const [showFull, setShowFull] = useState(false);
  const headingId = `record-drawer-${title.toLowerCase()}-heading`;

  if (decoded.kind === 'empty') {
    return (
      <section className={styles.block} aria-labelledby={headingId}>
        <h5 id={headingId}>{title}</h5>
        <p className={styles.mono}>(empty)</p>
      </section>
    );
  }

  if (decoded.kind === 'binary') {
    return (
      <section className={styles.block} aria-labelledby={headingId}>
        <h5 id={headingId}>{title}</h5>
        <p className={styles.mono}>
          (binary, {decoded.byteLength} bytes — not displayable as text)
        </p>
      </section>
    );
  }

  if (decoded.kind === 'text') {
    const isLarge = decoded.text.length > DISPLAY_CAP_CHARS;
    const shown = isLarge && !showFull ? decoded.text.slice(0, DISPLAY_CAP_CHARS) : decoded.text;
    return (
      <section className={styles.block} aria-labelledby={headingId}>
        <h5 id={headingId}>{title}</h5>
        <pre className={styles.pre}>{shown}</pre>
        {isLarge && (
          <button
            type="button"
            className={styles.showFullButton}
            onClick={() => setShowFull((v) => !v)}
          >
            {showFull ? 'Show truncated' : 'Show full record'}
          </button>
        )}
      </section>
    );
  }

  // structured
  const tokens = tokenizeJson(decoded.value);
  const totalChars = tokens.reduce((n, t) => n + t.text.length, 0);
  const isLarge = totalChars > DISPLAY_CAP_CHARS;
  return (
    <section className={styles.block} aria-labelledby={headingId}>
      <h5 id={headingId}>{title}</h5>
      <pre className={styles.pre}>
        <HighlightedTokens
          tokens={tokens}
          charLimit={isLarge && !showFull ? DISPLAY_CAP_CHARS : undefined}
        />
      </pre>
      {isLarge && (
        <button
          type="button"
          className={styles.showFullButton}
          onClick={() => setShowFull((v) => !v)}
        >
          {showFull ? 'Show truncated' : 'Show full record'}
        </button>
      )}
    </section>
  );
}

/**
 * Full-record inspection side drawer. Presentational — all record/stage state
 * is passed in. Traps focus to the close button on open and returns it to the
 * triggering "View" button on close (the caller unmounts the Drawer on close,
 * which itself hands focus back via the browser's default focus-return
 * behavior only if the trigger element still exists; RecordFlowContent's
 * "View" button is always in the DOM after the drawer closes, so this holds).
 */
export function Drawer({ record, stages, stageBuffers, onClose }: DrawerProps) {
  const [showUnchanged, setShowUnchanged] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  // Focus management: move focus in on mount, trap Tab/Shift+Tab within the
  // drawer while open, and return focus to whatever had it (the row's "View"
  // button, in normal use) when the drawer unmounts.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    return () => {
      previouslyFocused?.focus();
    };
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const container = drawerRef.current;
      if (!container) return;
      const focusable = container.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const posInfo = formatPosition(record.position);
  const keyDecoded = decodeData(record.key);
  const isDeleteNoAfter =
    record.operation === 'OPERATION_DELETE' && record.payload?.after === undefined;
  const payloadDecoded = decodeData(
    isDeleteNoAfter ? record.payload?.before : record.payload?.after
  );
  const metadataEntries = Object.entries(record.metadata ?? {});

  const rows = useMemo(
    () => buildStageDiffRows(record, stages, stageBuffers),
    [record, stages, stageBuffers]
  );

  // Closes only when the click lands on the backdrop itself, not a descendant
  // — the standard "click outside to close" test — so the dialog section
  // below needs no onClick/stopPropagation of its own (nothing non-interactive
  // there ends up carrying a mouse handler).
  function handleOverlayClick(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    // The backdrop's click-to-close is a mouse-only convenience; the keyboard
    // equivalent (Escape) is wired above as a document-level listener.
    <div className={styles.overlay} role="presentation" onClick={handleOverlayClick}>
      <section
        ref={drawerRef}
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-drawer-heading"
      >
        <header className={styles.drawerHeader}>
          <h4 id="record-drawer-heading">Record {posInfo.short}</h4>
          <button
            type="button"
            ref={closeButtonRef}
            className={styles.closeButton}
            onClick={onClose}
          >
            Close
          </button>
        </header>

        <dl className={styles.drawerMeta}>
          <dt>Position</dt>
          <dd className={styles.mono} title={posInfo.full}>
            {posInfo.full.length > 0 ? posInfo.full : '(none — cannot diff across stages)'}
          </dd>
          <dt>Operation</dt>
          <dd>{record.operation ?? 'OPERATION_UNSPECIFIED'}</dd>
        </dl>

        <PayloadBlock title="Key" decoded={keyDecoded} />
        <PayloadBlock title="Payload" decoded={payloadDecoded} />

        <section className={styles.block} aria-labelledby="record-drawer-metadata-heading">
          <h5 id="record-drawer-metadata-heading">Metadata</h5>
          {metadataEntries.length === 0 ? (
            <p className={styles.mono}>none</p>
          ) : (
            <dl className={styles.drawerMeta}>
              {metadataEntries.map(([k, v]) => (
                <Fragment key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </Fragment>
              ))}
            </dl>
          )}
        </section>

        <section className={styles.block} aria-labelledby="record-drawer-stage-diff-heading">
          <div className={styles.diffHeader}>
            <h5 id="record-drawer-stage-diff-heading">Per-stage diff</h5>
            <label>
              <input
                type="checkbox"
                checked={showUnchanged}
                onChange={(e) => setShowUnchanged(e.target.checked)}
              />
              Show unchanged fields
            </label>
          </div>
          <StageDiffSection rows={rows} showUnchanged={showUnchanged} />
        </section>
      </section>
    </div>
  );
}
