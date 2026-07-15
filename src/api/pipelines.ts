import { useQuery, type QueryFunctionContext, type UseQueryResult } from '@tanstack/react-query';
import { createConduitClient, type ConduitClient } from './client';
import type { SchemaV1Pipeline } from './schema';

// Poll interval for the fleet list. The engine exposes no push/stream for
// pipeline state, and pipelines change out-of-band (CLI, config reload, another
// UI tab — design doc Decision 6), so we poll. 3s balances freshness against
// load; it is not in the data path so staleness here is cosmetic, never a
// correctness issue.
export const POLL_INTERVAL_MS = 3000;

export type UsePipelinesResult = UseQueryResult<SchemaV1Pipeline[], Error>;

const defaultClient = createConduitClient();

// Fetch + normalize the pipeline list. Exported so the wire-parsing (the 200 body
// is a bare v1Pipeline[], not a {pipelines} wrapper — grpc-gateway models it that
// way) is unit-testable without React.
export async function fetchPipelines(
  client: ConduitClient,
  signal?: AbortSignal
): Promise<SchemaV1Pipeline[]> {
  const { data, error, response } = await client.GET('/v1/pipelines', { signal: signal ?? null });
  if (error !== undefined) {
    throw new Error(`Failed to load pipelines (HTTP ${response.status})`);
  }
  return data ?? [];
}

// The query options for the pipeline list, extracted so the resilience contract
// below is testable against the real options (queryFn, queryKey, no onError)
// rather than only through the presentational layer.
//
// Resilience contract (relied on by the fleet view):
//   - On a failed refetch after a prior success, TanStack retains the last-good
//     `data` and surfaces `error` alongside it. We add NO onError that clears
//     data and never vary the queryKey on retry, so the list is never wiped to
//     empty (which would read as "no pipelines" — a false negative).
//   - Failures back off exponentially instead of hammering a down engine every 3s.
export function pipelinesQueryOptions(client: ConduitClient = defaultClient) {
  return {
    queryKey: ['pipelines'] as const,
    queryFn: ({ signal }: QueryFunctionContext) => fetchPipelines(client, signal),
    refetchInterval: POLL_INTERVAL_MS,
    // Don't poll a hidden tab; refetch once on focus/reconnect instead.
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 3,
    retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 30_000),
  };
}

// usePipelines fetches GET /v1/pipelines (ListPipelines) and polls it. The client
// is injectable so tests can drive it without touching the network.
export function usePipelines(client: ConduitClient = defaultClient): UsePipelinesResult {
  return useQuery<SchemaV1Pipeline[], Error>(pipelinesQueryOptions(client));
}
