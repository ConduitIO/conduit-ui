// Pure field-level diff between two already-flattened record views (see
// record.ts's flattenRecord). Deliberately takes two Maps rather than two
// records: "this stage hasn't observed this position yet" is a distinct case
// from "the field was removed here", and that distinction is the CALLER's job
// (the per-stage walk in Drawer.tsx) — diffRecords only ever compares two views
// that both genuinely exist (see the plan's §4 point 3: "skip 'not yet observed'
// in the pairwise walk, but render them as gaps").

export type FieldDiffKind = 'added' | 'removed' | 'changed' | 'unchanged';

export interface FieldDiff {
  path: string;
  kind: FieldDiffKind;
  before?: string;
  after?: string;
}

/**
 * Compares a `before` flattened view to an `after` flattened view and returns
 * one FieldDiff per distinct path across both, sorted by path for a stable,
 * deterministic render order (Map iteration order isn't a meaningful signal
 * here — it's insertion order, not field importance).
 */
export function diffRecords(
  beforeMap: ReadonlyMap<string, string>,
  afterMap: ReadonlyMap<string, string>
): FieldDiff[] {
  const paths = new Set<string>([...beforeMap.keys(), ...afterMap.keys()]);
  const out: FieldDiff[] = [];

  for (const path of paths) {
    const before = beforeMap.get(path);
    const after = afterMap.get(path);

    if (before === undefined && after !== undefined) {
      out.push({ path, kind: 'added', after });
    } else if (before !== undefined && after === undefined) {
      out.push({ path, kind: 'removed', before });
    } else if (before !== undefined && after !== undefined) {
      // Narrowing both to `string` here (rather than relying on `before !==
      // after` alone) keeps this branch's object literal free of an explicit
      // `undefined` under exactOptionalPropertyTypes.
      out.push(
        before !== after
          ? { path, kind: 'changed', before, after }
          : { path, kind: 'unchanged', before, after }
      );
    }
    // Both undefined is unreachable: `path` only enters `paths` because it was
    // a key in at least one of the two maps.
  }

  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

/** Convenience filter for the Drawer's default "changed fields only" view. */
export function changedOnly(diffs: readonly FieldDiff[]): FieldDiff[] {
  return diffs.filter((d) => d.kind !== 'unchanged');
}
