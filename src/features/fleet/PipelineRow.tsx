import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusPill } from '../../components/StatusPill';
import type { FleetEntry } from './fleet';
import styles from './FleetView.module.css';

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
            // Only reference the panel while it exists in the DOM (it renders
            // conditionally below), so aria-controls never dangles to a missing id.
            {...(open ? { 'aria-controls': errorId } : {})}
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
