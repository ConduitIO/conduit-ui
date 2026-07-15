import { describe, it, expect } from 'vitest';
import type { SchemaV1PipelineStatus, SchemaStateStoppedReason } from '../api/schema';
import {
  describePipelineStatus,
  errorFirstLine,
  SEVERITY_RANK,
  type Severity,
} from './pipelineStatus';

const STATUSES: SchemaV1PipelineStatus[] = [
  'STATUS_UNSPECIFIED',
  'STATUS_RUNNING',
  'STATUS_STOPPED',
  'STATUS_DEGRADED',
  'STATUS_RECOVERING',
];
const REASONS: SchemaStateStoppedReason[] = [
  'STOPPED_REASON_UNSPECIFIED',
  'STOPPED_REASON_USER',
  'STOPPED_REASON_SYSTEM',
];

// Expected severity keyed by status, and — only for STOPPED — by reason.
function expectedSeverity(
  status: SchemaV1PipelineStatus,
  reason: SchemaStateStoppedReason
): Severity {
  switch (status) {
    case 'STATUS_DEGRADED':
      return 'degraded';
    case 'STATUS_RECOVERING':
      return 'recovering';
    case 'STATUS_RUNNING':
      return 'running';
    case 'STATUS_STOPPED':
      return reason === 'STOPPED_REASON_SYSTEM' ? 'system-stopped' : 'user-stopped';
    default:
      return 'unknown';
  }
}

describe('describePipelineStatus — all 15 status×reason combinations', () => {
  for (const status of STATUSES) {
    for (const reason of REASONS) {
      it(`${status} + ${reason}`, () => {
        const got = describePipelineStatus({ status, stoppedReason: reason });
        const want = expectedSeverity(status, reason);
        expect(got.severity).toBe(want);
        // needsAttention is derivable from severity and must agree with it.
        expect(got.needsAttention).toBe(
          want === 'degraded' || want === 'recovering' || want === 'system-stopped'
        );
      });
    }
  }

  it('ignores stoppedReason unless status == STATUS_STOPPED (no mis-bucketing)', () => {
    // A malformed/older server sending SYSTEM on a RUNNING pipeline must stay running.
    for (const status of STATUSES) {
      if (status === 'STATUS_STOPPED') continue;
      const withSystem = describePipelineStatus({ status, stoppedReason: 'STOPPED_REASON_SYSTEM' });
      const withUnset = describePipelineStatus({ status });
      expect(withSystem.severity).toBe(withUnset.severity);
      // never system-stopped for a non-stopped status
      expect(withSystem.severity).not.toBe('system-stopped');
    }
  });

  it('just-created pipeline (STOPPED + USER, and STOPPED + UNSPECIFIED) is a calm user-stop', () => {
    expect(
      describePipelineStatus({ status: 'STATUS_STOPPED', stoppedReason: 'STOPPED_REASON_USER' })
    ).toMatchObject({ severity: 'user-stopped', needsAttention: false });
    expect(describePipelineStatus({ status: 'STATUS_STOPPED' })).toMatchObject({
      severity: 'user-stopped',
      needsAttention: false,
    });
  });

  it('system-stopped is the one stopped case that needs attention', () => {
    const got = describePipelineStatus({
      status: 'STATUS_STOPPED',
      stoppedReason: 'STOPPED_REASON_SYSTEM',
    });
    expect(got).toMatchObject({
      severity: 'system-stopped',
      tone: 'stopped',
      needsAttention: true,
    });
  });

  it('undefined / empty state falls back to unknown, not running', () => {
    expect(describePipelineStatus(undefined).severity).toBe('unknown');
    expect(describePipelineStatus({}).severity).toBe('unknown');
  });
});

describe('severity ordering', () => {
  it('ranks most-urgent first: degraded < recovering < system-stopped < running < user-stopped < unknown', () => {
    const order: Severity[] = [
      'degraded',
      'recovering',
      'system-stopped',
      'running',
      'user-stopped',
      'unknown',
    ];
    const ranks = order.map((s) => SEVERITY_RANK[s]);
    const sorted = [...ranks].sort((a, b) => a - b);
    expect(ranks).toEqual(sorted);
    // strictly increasing (no ties — every severity sorts deterministically)
    expect(new Set(ranks).size).toBe(ranks.length);
  });
});

describe('errorFirstLine', () => {
  it('returns the first non-empty line, trimmed', () => {
    expect(errorFirstLine('boom: connection refused\n  at foo\n  at bar')).toBe(
      'boom: connection refused'
    );
  });
  it('returns undefined for empty/whitespace/undefined', () => {
    expect(errorFirstLine(undefined)).toBeUndefined();
    expect(errorFirstLine('')).toBeUndefined();
    expect(errorFirstLine('   \n  ')).toBeUndefined();
  });
});
