import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import type { FleetEntry } from './fleet';
import styles from './FleetView.module.css';

// Non-color-only status indicator: a shape glyph + text label, tinted by the
// status token. Screen readers and colorblind users get the label; color is
// redundant reinforcement, never the sole signal (AC7).
const TONE_GLYPH: Record<string, string> = {
  running: '●',
  degraded: '▲',
  recovering: '◐',
  stopped: '■',
  unknown: '?',
};

function StatusPill({ tone, label }: { tone: string; label: string }) {
  return (
    <span
      className={styles.pill}
      data-tone={tone}
      style={{ ['--pill-color' as string]: `var(--conduit-color-status-${tone})` }}
    >
      <span className={styles.pillGlyph} aria-hidden="true">
        {TONE_GLYPH[tone] ?? '■'}
      </span>
      <span className={styles.pillLabel}>{label}</span>
    </span>
  );
}

interface PipelineRowProps {
  entry: FleetEntry;
  // Needs-attention rows can expand to show the full error string; healthy rows
  // are compact and have nothing to expand.
  expandable?: boolean;
}

export function PipelineRow({ entry, expandable = false }: PipelineRowProps) {
  const [open, setOpen] = useState(false);
  const errorId = useId();
  const fullError = entry.pipeline.state?.error;
  const canExpand = expandable && Boolean(fullError);

  return (
    <li className={styles.row} data-severity={entry.display.severity}>
      <div className={styles.rowMain}>
        <StatusPill tone={entry.display.tone} label={entry.display.label} />
        <Link className={styles.rowName} to={`/pipelines/${encodeURIComponent(entry.id)}`}>
          {entry.name}
        </Link>
        {entry.errorLine && (
          <span className={styles.errorLine} title={entry.errorLine}>
            {entry.errorLine}
          </span>
        )}
        {canExpand && (
          <button
            type="button"
            className={styles.expandButton}
            aria-expanded={open}
            aria-controls={errorId}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Hide details' : 'Show details'}
          </button>
        )}
      </div>
      {canExpand && open && (
        // The wire carries the error only as a flat string (ConduitError structure
        // — code/configPath/suggestion — does not survive onto Pipeline.State.error).
        // So we show the full untruncated message; richer structured diagnostics are
        // deferred to the pipeline detail view (UI-3) + a future additive API field.
        <pre id={errorId} className={styles.errorFull}>
          {fullError}
        </pre>
      )}
    </li>
  );
}
