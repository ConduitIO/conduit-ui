import { useQuery, type QueryFunctionContext, type UseQueryResult } from '@tanstack/react-query';
import { createConduitClient, type ConduitClient } from './client';
import { POLL_INTERVAL_MS } from './pipelines';
import type { SchemaV1Pipeline, SchemaApiv1Connector, SchemaApiv1Processor } from './schema';

const defaultClient = createConduitClient();

// Thrown when GetPipeline returns 404, so the detail view can render a distinct
// "not found" state (and the query can skip retrying — a 404 is not transient).
export class PipelineNotFoundError extends Error {
  readonly id: string;
  constructor(id: string) {
    super(`Pipeline "${id}" not found`);
    this.name = 'PipelineNotFoundError';
    this.id = id;
  }
}

export async function fetchPipeline(
  client: ConduitClient,
  id: string,
  signal?: AbortSignal
): Promise<SchemaV1Pipeline> {
  const { data, error, response } = await client.GET('/v1/pipelines/{id}', {
    params: { path: { id } },
    signal: signal ?? null,
  });
  if (error !== undefined) {
    if (response.status === 404) throw new PipelineNotFoundError(id);
    throw new Error(`Failed to load pipeline (HTTP ${response.status})`);
  }
  // The 200 body is a bare v1Pipeline (grpc-gateway, no wrapper). data is defined here.
  return data;
}

export interface Topology {
  connectors: SchemaApiv1Connector[];
  processors: SchemaApiv1Processor[];
  /**
   * True when the connectors loaded but the processors call failed — the graph
   * degrades to connectors + a note rather than blanking the whole view. A total
   * (connectors) failure throws instead, so keep-last-known applies.
   */
  processorsUnavailable: boolean;
}

// Assemble a pipeline's topology inputs in one query: the connectors filtered by
// pipelineId (one call), then every processor for the pipeline + its connectors in
// one call via repeated `parentIds` (verified to serialize as parentIds=a&parentIds=b,
// which grpc-gateway expects). Two round trips because the processor parentIds depend
// on the connector ids; no per-id N+1.
export async function fetchTopology(
  client: ConduitClient,
  id: string,
  signal?: AbortSignal
): Promise<Topology> {
  const sig = signal ?? null;
  const connRes = await client.GET('/v1/connectors', {
    params: { query: { pipelineId: id } },
    signal: sig,
  });
  if (connRes.error !== undefined) {
    throw new Error(`Failed to load connectors (HTTP ${connRes.response.status})`);
  }
  const connectors = connRes.data ?? [];

  const parentIds = [id, ...connectors.map((c) => c.id).filter((v): v is string => Boolean(v))];
  const procRes = await client.GET('/v1/processors', {
    params: { query: { parentIds } },
    signal: sig,
  });
  if (procRes.error !== undefined) {
    // Connectors are in hand; degrade gracefully rather than losing the whole graph.
    // The next poll retries the processors call.
    return { connectors, processors: [], processorsUnavailable: true };
  }
  return { connectors, processors: procRes.data ?? [], processorsUnavailable: false };
}

// Don't retry a not-found (it isn't transient); back off on everything else, capped
// at 3 attempts — mirrors pipelinesQueryOptions.
function retry(failureCount: number, error: Error): boolean {
  if (error instanceof PipelineNotFoundError) return false;
  return failureCount < 3;
}
const retryDelay = (attempt: number) => Math.min(1000 * 2 ** attempt, 30_000);

export function pipelineDetailQueryOptions(id: string, client: ConduitClient = defaultClient) {
  return {
    queryKey: ['pipeline', id] as const,
    queryFn: ({ signal }: QueryFunctionContext) => fetchPipeline(client, id, signal),
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry,
    retryDelay,
  };
}

export function pipelineTopologyQueryOptions(id: string, client: ConduitClient = defaultClient) {
  return {
    queryKey: ['pipeline-topology', id] as const,
    queryFn: ({ signal }: QueryFunctionContext) => fetchTopology(client, id, signal),
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry,
    retryDelay,
  };
}

export function usePipelineDetail(
  id: string,
  client: ConduitClient = defaultClient
): UseQueryResult<SchemaV1Pipeline, Error> {
  return useQuery(pipelineDetailQueryOptions(id, client));
}

export function usePipelineTopology(
  id: string,
  client: ConduitClient = defaultClient
): UseQueryResult<Topology, Error> {
  return useQuery(pipelineTopologyQueryOptions(id, client));
}
