import type { SchemaV1Pipeline } from '../../api/schema';
import {
  describePipelineStatus,
  errorFirstLine,
  SEVERITY_RANK,
  type PipelineDisplayStatus,
} from '../../domain/pipelineStatus';

// A pipeline plus its derived display status and a stable display name/id. This
// is what the fleet view renders; the raw wire pipeline is kept for the row link.
export interface FleetEntry {
  id: string;
  name: string;
  display: PipelineDisplayStatus;
  errorLine: string | undefined;
  pipeline: SchemaV1Pipeline;
}

export interface FleetCounts {
  running: number;
  degraded: number;
  recovering: number;
  stopped: number; // user + system stopped
  unknown: number;
  total: number;
}

export interface FleetModel {
  // Sorted, most-urgent first. `needsAttention` is degraded/recovering/system-stopped.
  needsAttention: FleetEntry[];
  running: FleetEntry[];
  // Calm user-stopped pipelines, de-emphasized.
  calm: FleetEntry[];
  // Defensive-only: pipelines with an unrecognized/unspecified status. Kept
  // separate so they're never mislabeled under the "Stopped" heading.
  unknown: FleetEntry[];
  counts: FleetCounts;
}

function displayName(p: SchemaV1Pipeline): string {
  return p.config?.name?.trim() || p.id || '(unnamed)';
}

function toEntry(p: SchemaV1Pipeline): FleetEntry {
  const display = describePipelineStatus(p.state);
  return {
    id: p.id ?? '',
    name: displayName(p),
    display,
    // Only surface an inline error line where it's the actionable signal.
    errorLine: display.needsAttention ? errorFirstLine(p.state?.error) : undefined,
    pipeline: p,
  };
}

// Sort most-urgent first, then alphabetically by name for a stable, scannable order.
function bySeverityThenName(a: FleetEntry, b: FleetEntry): number {
  const rank = SEVERITY_RANK[a.display.severity] - SEVERITY_RANK[b.display.severity];
  return rank !== 0 ? rank : a.name.localeCompare(b.name);
}

// Pure: turn the wire list into the grouped, sorted, counted model the view renders.
// O(n log n) from the sorts; no nested scans.
export function buildFleetModel(pipelines: readonly SchemaV1Pipeline[]): FleetModel {
  const entries = pipelines.map(toEntry);

  const needsAttention: FleetEntry[] = [];
  const running: FleetEntry[] = [];
  const calm: FleetEntry[] = [];
  const unknown: FleetEntry[] = [];
  const counts: FleetCounts = {
    running: 0,
    degraded: 0,
    recovering: 0,
    stopped: 0,
    unknown: 0,
    total: entries.length,
  };

  for (const e of entries) {
    switch (e.display.severity) {
      case 'degraded':
        counts.degraded += 1;
        needsAttention.push(e);
        break;
      case 'recovering':
        counts.recovering += 1;
        needsAttention.push(e);
        break;
      case 'system-stopped':
        counts.stopped += 1;
        needsAttention.push(e);
        break;
      case 'running':
        counts.running += 1;
        running.push(e);
        break;
      case 'user-stopped':
        counts.stopped += 1;
        calm.push(e);
        break;
      case 'unknown':
      default:
        counts.unknown += 1;
        unknown.push(e);
        break;
    }
  }

  needsAttention.sort(bySeverityThenName);
  running.sort(bySeverityThenName);
  calm.sort(bySeverityThenName);
  unknown.sort(bySeverityThenName);

  return { needsAttention, running, calm, unknown, counts };
}
