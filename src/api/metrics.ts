// Hand-rolled Prometheus text-exposition parser (UI-5). `/metrics` is NOT part of
// the generated typed client (design doc / UI-5 plan §1): grpc-gateway's OpenAPI
// schema has no `/metrics` path at all, because this is the Prometheus text
// format, not JSON. A raw `fetch` + a small parser is the only option — no
// dependency added (YAGNI; the format is simple enough that a library would cost
// more than it saves).
//
// Deliberately dumb: every exposition line — including a histogram's `_bucket`,
// `_sum`, and `_count` lines — becomes its own entry keyed by its literal metric
// name, exactly as scraped. Nothing is reassembled into a synthetic "histogram"
// type; callers reason about exactly what was on the wire. This mirrors the plan's
// `ParsedMetrics` contract (§3).
//
// UI-4's `dropRate.ts` has a small amount of parsing overlap with this file (both
// hand-roll a line reader for the same wire format). Left as-is for these two
// parallel PRs — a follow-up can dedupe into this module once both have landed.

/** One exposition-format sample: its label set and numeric value. */
export interface MetricSample {
  labels: Record<string, string>;
  value: number;
}

/** Metric name -> every sample observed for that name, in file order. */
export type ParsedMetrics = Map<string, MetricSample[]>;

// Matches one `name="value"` pair inside a label list, tolerating the escaped
// quotes/backslashes/newlines the exposition format allows inside label values.
const LABEL_PAIR_RE = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g;

function unescapeLabelValue(v: string): string {
  return v.replace(/\\(.)/g, (_match, ch: string) => (ch === 'n' ? '\n' : ch));
}

function parseLabels(raw: string): Record<string, string> {
  const labels: Record<string, string> = {};
  LABEL_PAIR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LABEL_PAIR_RE.exec(raw)) !== null) {
    const key = m[1];
    const value = m[2];
    if (key === undefined || value === undefined) continue; // can't happen given the regex's two required groups, but keeps noUncheckedIndexedAccess honest
    labels[key] = unescapeLabelValue(value);
  }
  return labels;
}

// Prometheus values are always a token (no surrounding quotes); +Inf/-Inf/NaN are
// literal per the exposition format, everything else is a plain float.
function parseValue(raw: string): number | undefined {
  if (raw === '+Inf') return Infinity;
  if (raw === '-Inf') return -Infinity;
  if (raw === 'NaN') return NaN;
  if (raw.length === 0) return undefined;
  const n = Number(raw);
  return Number.isNaN(n) ? undefined : n; // genuinely malformed token (e.g. "abc")
}

/**
 * Parses Prometheus text-exposition format into a name -> samples map.
 *
 * Malformed lines are skipped, never thrown: a truncated scrape or a future
 * metric shape this parser doesn't anticipate must not blank the whole metrics
 * view (same "degrade, don't crash" contract as the rest of this feature — see
 * the plan's §5 failure modes). `# HELP` / `# TYPE` comments and blank lines are
 * ignored; nothing depends on `# TYPE` being present.
 */
export function parseMetricsText(text: string): ParsedMetrics {
  const parsed: ParsedMetrics = new Map();

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;

    const braceIdx = line.indexOf('{');
    let name: string;
    let labels: Record<string, string>;
    let rest: string;

    if (braceIdx === -1) {
      const sp = line.indexOf(' ');
      if (sp === -1) continue; // no value token — malformed
      name = line.slice(0, sp);
      labels = {};
      rest = line.slice(sp + 1).trim();
    } else {
      const closeIdx = line.indexOf('}', braceIdx);
      if (closeIdx === -1) continue; // unterminated label set — malformed
      name = line.slice(0, braceIdx);
      labels = parseLabels(line.slice(braceIdx + 1, closeIdx));
      rest = line.slice(closeIdx + 1).trim();
    }
    if (name.length === 0 || rest.length === 0) continue;

    // The value is the first whitespace-separated token; a second token would be
    // an optional exposition-format timestamp, which we don't use (we timestamp
    // client-side at fetch time — see pipelineMetrics.ts).
    const valueToken = rest.split(/\s+/, 1)[0] ?? '';
    const value = parseValue(valueToken);
    if (value === undefined) continue;

    const entry: MetricSample = { labels, value };
    const list = parsed.get(name);
    if (list) list.push(entry);
    else parsed.set(name, [entry]);
  }

  return parsed;
}

/**
 * Every sample for `name` whose labels match all of `labels` (extra labels on the
 * sample that aren't named here are ignored — e.g. matching only `pipeline_name`
 * still returns every `plugin`/`type`/`component_id` variant). Use this whenever
 * more than one match is expected, such as every `le` bucket of a histogram for a
 * fixed (pipeline, plugin, type).
 */
export function samplesMatching(
  parsed: ParsedMetrics,
  name: string,
  labels: Record<string, string> = {}
): MetricSample[] {
  const list = parsed.get(name);
  if (!list) return [];
  const keys = Object.entries(labels);
  return list.filter(({ labels: sampleLabels }) => keys.every(([k, v]) => sampleLabels[k] === v));
}

/**
 * The one sample for `name` uniquely identified by `labels`. Returns `undefined`
 * both when nothing matches and when more than one sample matches — an ambiguous
 * match is never silently resolved by picking the first. Callers that expect (or
 * want to tolerate) multiple matches use `samplesMatching` instead.
 */
export function sample(
  parsed: ParsedMetrics,
  name: string,
  labels: Record<string, string>
): MetricSample | undefined {
  const matches = samplesMatching(parsed, name, labels);
  return matches.length === 1 ? matches[0] : undefined;
}

/**
 * Fetches and parses the Prometheus text-exposition endpoint. `baseUrl` defaults
 * to same-origin (the embedded UI case), matching `createConduitClient`'s
 * convention in ./client.ts.
 */
export async function fetchMetrics(baseUrl = '', signal?: AbortSignal): Promise<ParsedMetrics> {
  const res = await fetch(`${baseUrl}/metrics`, { signal: signal ?? null });
  if (!res.ok) {
    throw new Error(`Failed to load metrics (HTTP ${res.status})`);
  }
  return parseMetricsText(await res.text());
}
