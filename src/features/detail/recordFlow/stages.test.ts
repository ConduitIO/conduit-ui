import { describe, it, expect } from 'vitest';
import type { TopologyConnectorNode, TopologyModel, TopologyProcessorNode } from '../topology';
import { buildStageList } from './stages';

function connector(
  id: string,
  processors: TopologyProcessorNode[] = [],
  unavailable = false
): TopologyConnectorNode {
  return { id, label: id, plugin: `builtin:${id}`, processors, unavailable };
}

function processor(id: string, unavailable = false): TopologyProcessorNode {
  return { id, label: id, conditional: false, unavailable };
}

function model(over: Partial<TopologyModel> = {}): TopologyModel {
  return {
    sources: [],
    destinations: [],
    other: [],
    pipelineProcessors: [],
    orphanProcessors: [],
    isEmpty: false,
    ...over,
  };
}

describe('buildStageList', () => {
  it('orders: primary source connector -> its processors (in/out) -> pipeline processors (in/out) -> per-destination processors (in/out) -> destination connector', () => {
    const m = model({
      sources: [connector('src1', [processor('src-proc')])],
      pipelineProcessors: [processor('pl-proc')],
      destinations: [connector('dst1', [processor('dst-proc')])],
    });
    const stages = buildStageList(m);
    expect(stages.map((s) => s.id)).toEqual([
      'src1',
      'src-proc:in',
      'src-proc:out',
      'pl-proc:in',
      'pl-proc:out',
      'dst-proc:in',
      'dst-proc:out',
      'dst1',
    ]);
  });

  it('multiple sources: only the first source is walked (documented v1 scoping)', () => {
    const m = model({
      sources: [connector('src1'), connector('src2', [processor('src2-proc')])],
      destinations: [connector('dst1')],
    });
    const stages = buildStageList(m);
    expect(stages.map((s) => s.id)).toEqual(['src1', 'dst1']);
    expect(stages.some((s) => s.id.startsWith('src2'))).toBe(false);
  });

  it('multiple destinations are all walked, each with their own processors', () => {
    const m = model({
      sources: [connector('src1')],
      destinations: [connector('dst1', [processor('d1p')]), connector('dst2')],
    });
    const stages = buildStageList(m);
    expect(stages.map((s) => s.id)).toEqual(['src1', 'd1p:in', 'd1p:out', 'dst1', 'dst2']);
  });

  it('an unavailable primary source produces no source stage at all', () => {
    const m = model({ sources: [connector('ghost', [], true)], destinations: [connector('dst1')] });
    expect(buildStageList(m).map((s) => s.id)).toEqual(['dst1']);
  });

  it('an unavailable connector-level or pipeline-level processor is skipped', () => {
    const m = model({
      sources: [connector('src1', [processor('ok'), processor('ghost-proc', true)])],
      pipelineProcessors: [processor('pl-ghost', true), processor('pl-ok')],
    });
    const stages = buildStageList(m);
    expect(stages.map((s) => s.id)).toEqual(['src1', 'ok:in', 'ok:out', 'pl-ok:in', 'pl-ok:out']);
  });

  it('an unavailable destination connector is skipped entirely (including its processors)', () => {
    const m = model({
      sources: [connector('src1')],
      destinations: [connector('ghost-dst', [processor('would-be-inspected')], true)],
    });
    expect(buildStageList(m).map((s) => s.id)).toEqual(['src1']);
  });

  it('no sources and no destinations yields an empty stage list, not a crash', () => {
    expect(buildStageList(model())).toEqual([]);
  });

  it('processor stages share one componentId across their in/out pair (for drop-rate aggregation)', () => {
    const m = model({ sources: [connector('src1', [processor('p1')])] });
    const stages = buildStageList(m);
    const inStage = stages.find((s) => s.id === 'p1:in');
    const outStage = stages.find((s) => s.id === 'p1:out');
    expect(inStage?.componentId).toBe('p1');
    expect(outStage?.componentId).toBe('p1');
    expect(inStage?.inspectKind).toBe('processor-in');
    expect(outStage?.inspectKind).toBe('processor-out');
  });
});
