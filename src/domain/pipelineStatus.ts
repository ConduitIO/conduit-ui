import type {
  SchemaPipelineState,
  SchemaV1PipelineStatus,
  SchemaStateStoppedReason,
} from '../api/schema';

// Single source of truth for turning a wire `Pipeline.State` into how the fleet
// view presents it: a severity (drives sort + which section a pipeline lands in),
// a human label, and a tone that maps to a `--conduit-color-status-*` token. Every
// consumer (row, header count, future detail badge) reads this one function so the
// meaning of a status can never drift between them.
//
// Wire contract (proto/api/v1/api.proto, vendored in ../api/schema.d.ts):
//   status ∈ STATUS_{UNSPECIFIED,RUNNING,STOPPED,DEGRADED,RECOVERING}
//   stoppedReason ∈ STOPPED_REASON_{UNSPECIFIED,USER,SYSTEM}
// Semantics that are easy to get wrong and are enforced below:
//   - DEGRADED means "stopped WITH an error" (halted, not processing) — needs attention.
//   - RECOVERING means being restarted / backing off / health-checking — needs attention.
//   - stoppedReason is ONLY meaningful when status == STATUS_STOPPED. For any other
//     status it is ignored, no matter what value a malformed/older server sends.
//   - A just-created, never-started pipeline reports STOPPED + USER (calm), so USER
//     and UNSPECIFIED both bucket as an ordinary user-stop.
//   - SYSTEM stop (engine restarted a running pipeline and it wasn't resumed) is the
//     one "stopped" case that needs attention — this is exactly why P3 exists.

export type Severity =
  'degraded' | 'recovering' | 'system-stopped' | 'running' | 'user-stopped' | 'unknown';

// Lower rank = more urgent = sorts first / renders above the fold.
export const SEVERITY_RANK: Record<Severity, number> = {
  degraded: 0,
  recovering: 1,
  'system-stopped': 2,
  running: 3,
  'user-stopped': 4,
  unknown: 5,
};

// Tone selects a status color token; kept separate from severity because several
// severities share a tone (system- and user-stopped are both the "stopped" gray).
export type StatusTone = 'running' | 'stopped' | 'degraded' | 'recovering' | 'unknown';

export interface PipelineDisplayStatus {
  severity: Severity;
  /** Short human label shown in the row and legend. */
  label: string;
  /** Maps to `--conduit-color-status-<tone>`. */
  tone: StatusTone;
  /** True when the pipeline belongs in the health-first "needs attention" section. */
  needsAttention: boolean;
}

export function describePipelineStatus(
  state: SchemaPipelineState | undefined
): PipelineDisplayStatus {
  const status: SchemaV1PipelineStatus = state?.status ?? 'STATUS_UNSPECIFIED';

  switch (status) {
    case 'STATUS_DEGRADED':
      return { severity: 'degraded', label: 'Degraded', tone: 'degraded', needsAttention: true };
    case 'STATUS_RECOVERING':
      return {
        severity: 'recovering',
        label: 'Recovering',
        tone: 'recovering',
        needsAttention: true,
      };
    case 'STATUS_RUNNING':
      return { severity: 'running', label: 'Running', tone: 'running', needsAttention: false };
    case 'STATUS_STOPPED':
      return describeStopped(state?.stoppedReason);
    case 'STATUS_UNSPECIFIED':
    default:
      // Defensive: an unrecognized status value (a future server) is surfaced as
      // "Unknown", never silently mis-bucketed as running.
      return { severity: 'unknown', label: 'Unknown', tone: 'unknown', needsAttention: false };
  }
}

function describeStopped(reason: SchemaStateStoppedReason | undefined): PipelineDisplayStatus {
  // Only reached when status == STATUS_STOPPED, so reason is meaningful here.
  if (reason === 'STOPPED_REASON_SYSTEM') {
    return {
      severity: 'system-stopped',
      label: 'Stopped (system)',
      tone: 'stopped',
      needsAttention: true,
    };
  }
  // USER and UNSPECIFIED are both a calm user-stop (UNSPECIFIED covers the
  // just-created-never-started pipeline and older servers).
  return { severity: 'user-stopped', label: 'Stopped', tone: 'stopped', needsAttention: false };
}

/**
 * First non-blank line of a (possibly multi-line) error string, for the collapsed
 * row summary. Skips leading blank/whitespace lines so a message that starts with
 * a newline still gets a meaningful preview (the full text is always available via
 * the row's expand control).
 */
export function errorFirstLine(error: string | undefined): string | undefined {
  if (!error) return undefined;
  for (const line of error.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return undefined;
}
