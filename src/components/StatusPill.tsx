import type { CSSProperties } from 'react';
import type { StatusTone } from '../domain/pipelineStatus';
import styles from './StatusPill.module.css';

// Non-color-only status indicator: a shape glyph + text label, tinted by the
// status token. Screen readers and colorblind users get the label; color is
// redundant reinforcement, never the sole signal. Shared by the fleet rows and
// the pipeline detail badge so the status treatment can't drift between them.
const TONE_GLYPH: Record<StatusTone, string> = {
  running: '●',
  degraded: '▲',
  recovering: '◐',
  stopped: '■',
  unknown: '?',
};

export function StatusPill({ tone, label }: { tone: StatusTone; label: string }) {
  return (
    <span
      className={styles.pill}
      data-tone={tone}
      style={{ ['--pill-color']: `var(--conduit-color-status-${tone})` } as CSSProperties}
    >
      <span className={styles.pillGlyph} aria-hidden="true">
        {TONE_GLYPH[tone]}
      </span>
      <span className={styles.pillLabel}>{label}</span>
    </span>
  );
}
