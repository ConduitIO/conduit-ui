import { describe, it, expect } from 'vitest';
import type {
  SchemaV1Pipeline,
  SchemaApiv1Connector,
  SchemaApiv1Processor,
} from '../../api/schema';
import { buildTopologyModel } from './topology';

function conn(
  id: string,
  type: NonNullable<SchemaApiv1Connector['type']>,
  opts: { name?: string; plugin?: string; processorIds?: string[] } = {}
): SchemaApiv1Connector {
  return {
    id,
    type,
    plugin: opts.plugin ?? `builtin:${id}`,
    config: { name: opts.name ?? id },
    processorIds: opts.processorIds ?? [],
  };
}

function proc(
  id: string,
  opts: { plugin?: string; condition?: string } = {}
): SchemaApiv1Processor {
  return {
    id,
    plugin: opts.plugin ?? `builtin:${id}`,
    ...(opts.condition ? { condition: opts.condition } : {}),
  };
}

function pipe(opts: { connectorIds?: string[]; processorIds?: string[] }): SchemaV1Pipeline {
  return { id: 'p1', config: { name: 'p1' }, ...opts };
}

describe('buildTopologyModel', () => {
  it('buckets connectors by type: sources left, destinations right, unspecified to other', () => {
    const m = buildTopologyModel(
      pipe({ connectorIds: ['s1', 'd1', 'u1'] }),
      [conn('s1', 'TYPE_SOURCE'), conn('d1', 'TYPE_DESTINATION'), conn('u1', 'TYPE_UNSPECIFIED')],
      []
    );
    expect(m.sources.map((c) => c.id)).toEqual(['s1']);
    expect(m.destinations.map((c) => c.id)).toEqual(['d1']);
    expect(m.other.map((c) => c.id)).toEqual(['u1']);
    expect(m.isEmpty).toBe(false);
  });

  it('AC3: pipeline processor chain follows processorIds order, not object/id/name order', () => {
    // Objects returned in a DIFFERENT order than the ordered id array.
    const processors = [proc('c'), proc('a'), proc('b')];
    const m = buildTopologyModel(
      pipe({ connectorIds: [], processorIds: ['a', 'b', 'c'] }),
      [],
      processors
    );
    expect(m.pipelineProcessors.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('resolves connector-level processors in the connector processorIds order', () => {
    const m = buildTopologyModel(
      pipe({ connectorIds: ['s1'] }),
      [conn('s1', 'TYPE_SOURCE', { processorIds: ['p2', 'p1'] })],
      [proc('p1'), proc('p2')]
    );
    expect(m.sources[0]?.processors.map((p) => p.id)).toEqual(['p2', 'p1']);
    // connector-level processors are NOT in the pipeline chain
    expect(m.pipelineProcessors).toHaveLength(0);
  });

  it('marks a conditional processor', () => {
    const m = buildTopologyModel(
      pipe({ processorIds: ['p1', 'p2'] }),
      [],
      [proc('p1', { condition: '{{ eq .Key "x" }}' }), proc('p2')]
    );
    expect(m.pipelineProcessors[0]?.conditional).toBe(true);
    expect(m.pipelineProcessors[1]?.conditional).toBe(false);
  });

  it('AC10: a connectorId with no object becomes an unavailable placeholder in other, not a crash', () => {
    const m = buildTopologyModel(
      pipe({ connectorIds: ['s1', 'missing'] }),
      [conn('s1', 'TYPE_SOURCE')],
      []
    );
    expect(m.sources.map((c) => c.id)).toEqual(['s1']);
    const ph = m.other.find((c) => c.id === 'missing');
    expect(ph?.unavailable).toBe(true);
  });

  it('AC10: a processorId referenced by an ordered array but missing from the response is a placeholder', () => {
    const m = buildTopologyModel(pipe({ processorIds: ['there', 'gone'] }), [], [proc('there')]);
    expect(m.pipelineProcessors.map((p) => [p.id, p.unavailable])).toEqual([
      ['there', false],
      ['gone', true],
    ]);
  });

  it('surfaces orphan processors (returned but unreferenced) instead of silently dropping them', () => {
    const m = buildTopologyModel(
      pipe({ connectorIds: ['s1'], processorIds: ['p1'] }),
      [conn('s1', 'TYPE_SOURCE')],
      [proc('p1'), proc('orphan')]
    );
    expect(m.pipelineProcessors.map((p) => p.id)).toEqual(['p1']);
    expect(m.orphanProcessors.map((p) => p.id)).toEqual(['orphan']);
  });

  it('empty pipeline (no connectors) sets isEmpty and produces no columns', () => {
    const m = buildTopologyModel(pipe({ connectorIds: [] }), [], []);
    expect(m.isEmpty).toBe(true);
    expect(m.sources).toHaveLength(0);
    expect(m.destinations).toHaveLength(0);
    expect(m.pipelineProcessors).toHaveLength(0);
  });

  it('multi-source / multi-destination fan is preserved in connectorIds order', () => {
    const m = buildTopologyModel(
      pipe({ connectorIds: ['s1', 's2', 'd1', 'd2'] }),
      [
        conn('s2', 'TYPE_SOURCE'),
        conn('s1', 'TYPE_SOURCE'),
        conn('d2', 'TYPE_DESTINATION'),
        conn('d1', 'TYPE_DESTINATION'),
      ],
      []
    );
    // order follows connectorIds, not the response order
    expect(m.sources.map((c) => c.id)).toEqual(['s1', 's2']);
    expect(m.destinations.map((c) => c.id)).toEqual(['d1', 'd2']);
  });

  it('labels a connector by config.name, falling back to plugin then id', () => {
    const m = buildTopologyModel(
      pipe({ connectorIds: ['s1', 's2'] }),
      [
        conn('s1', 'TYPE_SOURCE', { name: 'My Source' }),
        { id: 's2', type: 'TYPE_SOURCE', plugin: 'builtin:pg', config: {} },
      ],
      []
    );
    expect(m.sources[0]?.label).toBe('My Source');
    expect(m.sources[1]?.label).toBe('builtin:pg');
  });

  it('dedupes duplicate ids so each renders at most once (React key safety)', () => {
    const m = buildTopologyModel(
      pipe({ connectorIds: ['s1', 's1'], processorIds: ['a', 'a'] }),
      [conn('s1', 'TYPE_SOURCE', { processorIds: ['b', 'b'] })],
      [proc('a'), proc('b')]
    );
    expect(m.sources.map((c) => c.id)).toEqual(['s1']);
    expect(m.pipelineProcessors.map((p) => p.id)).toEqual(['a']);
    expect(m.sources[0]?.processors.map((p) => p.id)).toEqual(['b']);
  });
});
