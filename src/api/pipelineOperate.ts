import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { createConduitClient, type ConduitClient } from './client';
import type { SchemaGooglerpcStatus } from './schema';

const defaultClient = createConduitClient();

/**
 * Thrown when StartPipeline/StopPipeline returns a non-2xx. Carries the gRPC
 * `code` and `message` verbatim (googlerpcStatus) rather than inventing a
 * friendlier reason — per the plan, errors are surfaced as-is so an operator
 * can act on the real cause (e.g. CodePipelineRunning failed-precondition).
 */
export class PipelineOperateError extends Error {
  /** gRPC status code (google.rpc.Code), e.g. 9 = FAILED_PRECONDITION. */
  readonly code: number | undefined;
  /** The raw message from the googlerpcStatus body, when the engine sent one. */
  readonly grpcMessage: string | undefined;

  constructor(
    action: 'start' | 'stop',
    httpStatus: number,
    status: SchemaGooglerpcStatus | undefined
  ) {
    const grpcMessage = status?.message;
    super(
      grpcMessage
        ? `${grpcMessage} (HTTP ${httpStatus})`
        : `Failed to ${action} pipeline (HTTP ${httpStatus})`
    );
    this.name = 'PipelineOperateError';
    this.code = status?.code;
    this.grpcMessage = grpcMessage;
  }
}

// Both StartPipeline and StopPipeline return an empty {} body on success — they
// confirm the transition was ACCEPTED, not that it was REACHED (Stop returns
// before drain completes). Authoritative status always comes from the next
// GET /v1/pipelines/{id} (or the fleet list), never from these responses — see
// usePipelineOperate's reconciliation gate.

export async function startPipeline(
  client: ConduitClient,
  id: string,
  signal?: AbortSignal
): Promise<void> {
  const { error, response } = await client.POST('/v1/pipelines/{id}/start', {
    params: { path: { id } },
    signal: signal ?? null,
  });
  if (error !== undefined) {
    throw new PipelineOperateError('start', response.status, error);
  }
}

// Never sets `force`. v0.18 UI has exactly one lever (StartPipeline/StopPipeline
// with no force flag) — a forced stop is out of scope for this slice.
export async function stopPipeline(
  client: ConduitClient,
  id: string,
  signal?: AbortSignal
): Promise<void> {
  const { error, response } = await client.POST('/v1/pipelines/{id}/stop', {
    params: { path: { id } },
    body: {},
    signal: signal ?? null,
  });
  if (error !== undefined) {
    throw new PipelineOperateError('stop', response.status, error);
  }
}

// onSettled always invalidates BOTH the per-id detail query and the fleet list
// query, regardless of which surface triggered the mutation — a stop confirmed
// from the fleet row must also refresh a detail view open on the same pipeline
// in another tab, and vice versa. This is the only reconciliation trigger: no
// separate subsystem, just an out-of-cadence refetch of the existing polls.
//
// Deliberately NO onMutate cache patch: the wire's SchemaV1PipelineStatus enum
// has no "starting"/"stopping" value, so writing one into the query cache would
// invent a status the server never sends, and risks a real poll landing
// mid-flight and stomping the fake value with (still old) real data. The
// pending label lives in local hook state instead (usePipelineOperate).
export function useStartPipeline(
  id: string,
  client: ConduitClient = defaultClient
): UseMutationResult<void, Error, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => startPipeline(client, id),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['pipeline', id] });
      void queryClient.invalidateQueries({ queryKey: ['pipelines'] });
    },
  });
}

export function useStopPipeline(
  id: string,
  client: ConduitClient = defaultClient
): UseMutationResult<void, Error, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => stopPipeline(client, id),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['pipeline', id] });
      void queryClient.invalidateQueries({ queryKey: ['pipelines'] });
    },
  });
}
