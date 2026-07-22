import { describe, it, expect } from 'vitest';
import { changedOnly, diffRecords } from './recordDiff';

function map(entries: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(entries));
}

describe('diffRecords', () => {
  it('AC4: a field-mutating processor produces exactly added/changed/removed, plus unchanged entries', () => {
    const before = map({
      'payload.after.email': 'old@example.com',
      'payload.after.dropped_field': 'gone-soon',
      'payload.after.stable': 'same',
    });
    const after = map({
      'payload.after.email': 'new@example.com',
      'payload.after.added_field': 'brand-new',
      'payload.after.stable': 'same',
    });

    const diffs = diffRecords(before, after);
    const byPath = new Map(diffs.map((d) => [d.path, d]));

    expect(byPath.get('payload.after.added_field')).toEqual({
      path: 'payload.after.added_field',
      kind: 'added',
      after: 'brand-new',
    });
    expect(byPath.get('payload.after.email')).toEqual({
      path: 'payload.after.email',
      kind: 'changed',
      before: 'old@example.com',
      after: 'new@example.com',
    });
    expect(byPath.get('payload.after.dropped_field')).toEqual({
      path: 'payload.after.dropped_field',
      kind: 'removed',
      before: 'gone-soon',
    });
    expect(byPath.get('payload.after.stable')).toEqual({
      path: 'payload.after.stable',
      kind: 'unchanged',
      before: 'same',
      after: 'same',
    });

    // The changed-only view (Drawer's default) excludes the unchanged entry.
    const changed = changedOnly(diffs);
    expect(changed.map((d) => d.path).sort()).toEqual([
      'payload.after.added_field',
      'payload.after.dropped_field',
      'payload.after.email',
    ]);
    expect(changed.some((d) => d.kind === 'unchanged')).toBe(false);
  });

  it('is sorted by path for a deterministic render order', () => {
    const diffs = diffRecords(map({ zeta: '1' }), map({ alpha: '2', zeta: '1' }));
    expect(diffs.map((d) => d.path)).toEqual(['alpha', 'zeta']);
  });

  it('two empty maps produce no diffs', () => {
    expect(diffRecords(map({}), map({}))).toEqual([]);
  });
});
