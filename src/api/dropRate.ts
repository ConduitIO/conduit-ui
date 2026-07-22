import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

// Reads Conduit's inspector drop counter off the same /metrics endpoint the
// engine already exposes (same HTTP server, same CORS config as the rest of the
// API — see plan §1's engine-facts section). This is NOT a general Prometheus
// text-format parser — it only recognizes the one metric family the live record
// flow needs, by design (YAGNI; a real parser is a separate concern if a future
// slice needs one).
//
// Engine-verified semantics this module must not misrepresent:
//   - conduit_inspector_dropped_records_total{component_id="..."} is a counter
//     (monotonic non-decreasing outside of a process restart).
//   - A processor's In and Out inspectors share one component_id, so a single
//     reading for a processor is already the in+out combined total — no summing
//     needed on this side (see RecordFlow.tsx's "(in+out combined)" label).
//   - Drops are tail-drop-on-full (newest dropped when the UI's consumer is
//     slow), independent of key/content — never a sample.

const METRIC_LINE_RE = /^conduit_inspector_dropped_records_total\{(.*)\}\s+([0-9eE+\-.]+)\s*$/;
const LABEL_RE = /([A-Za-z_][A-Za-z0-9_]*)="((?:[^"\\]|\\.)*)"/g;

/**
 * Scans Prometheus exposition text for `conduit_inspector_dropped_records_total`
 * lines only. Unrelated metric families, comments, blank lines, and malformed
 * lines are silently ignored (never thrown) — a scrape of a live /metrics
 * endpoint routinely contains hundreds of families this UI doesn't care about.
 */
export function parseInspectorDroppedCounters(text: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    const match = METRIC_LINE_RE.exec(line);
    if (!match) continue;
    const [, labelsStr, valueStr] = match;
    const value = Number(valueStr);
    if (!Number.isFinite(value)) continue;

    let componentId: string | undefined;
    LABEL_RE.lastIndex = 0;
    let labelMatch: RegExpExecArray | null;
    while ((labelMatch = LABEL_RE.exec(labelsStr ?? '')) !== null) {
      const [, key, val] = labelMatch;
      if (key === 'component_id') componentId = val;
    }
    if (componentId === undefined) continue;
    out.set(componentId, value);
  }
  return out;
}

export async function fetchMetricsText(baseUrl: string, signal?: AbortSignal): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, '')}/metrics`;
  const res = await fetch(url, signal !== undefined ? { signal } : {});
  if (!res.ok) throw new Error(`Failed to fetch metrics (HTTP ${res.status})`);
  return res.text();
}

/**
 * Polls /metrics and turns the raw (monotonic) drop counters into a per-second
 * rate per componentId, computed client-side from consecutive polls:
 *   - No previous sample yet (first poll, or the id just appeared) -> undefined,
 *     never 0 — "no data yet" must not look identical to "confirmed zero drops".
 *   - The counter went DOWN since the last poll -> a process restart reset it;
 *     treated as "no previous sample" (the new lower value becomes the new
 *     baseline) rather than reporting a nonsensical negative rate.
 *   - A componentId with no line in the scrape at all -> undefined.
 */
export function useDropRates(
  baseUrl: string,
  componentIds: readonly string[],
  pollMs = 5000
): Map<string, number | undefined> {
  const idsKey = componentIds.join('|');

  const query = useQuery({
    queryKey: ['inspector-dropped-raw', baseUrl],
    queryFn: ({ signal }) => fetchMetricsText(baseUrl, signal).then(parseInspectorDroppedCounters),
    refetchInterval: pollMs,
    refetchIntervalInBackground: false,
  });

  const prevRef = useRef<Map<string, { t: number; v: number }>>(new Map());
  const [rates, setRates] = useState<Map<string, number | undefined>>(new Map());

  useEffect(() => {
    if (!query.data) return;
    const ids = idsKey.length > 0 ? idsKey.split('|') : [];
    const now = Date.now();
    const nextRates = new Map<string, number | undefined>();
    const nextPrev = new Map<string, { t: number; v: number }>();

    for (const id of ids) {
      const curr = query.data.get(id);
      if (curr === undefined) {
        nextRates.set(id, undefined);
        continue;
      }
      const prev = prevRef.current.get(id);
      if (!prev || curr < prev.v) {
        nextRates.set(id, undefined);
      } else {
        const dtSeconds = (now - prev.t) / 1000;
        nextRates.set(id, dtSeconds > 0 ? (curr - prev.v) / dtSeconds : 0);
      }
      nextPrev.set(id, { t: now, v: curr });
    }

    prevRef.current = nextPrev;
    setRates(nextRates);
  }, [query.data, idsKey]);

  return rates;
}
