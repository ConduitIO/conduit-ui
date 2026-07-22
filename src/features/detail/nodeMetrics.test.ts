import { describe, it, expect } from 'vitest';
import type { TopologyModel, TopologyConnectorNode } from './topology';
import type { ConnectorRate, PipelineMetricsSnapshot } from '../../api/pipelineMetrics';
import {
  attributeToNodes,
  summarizePipelineActivity,
  formatBytesPerSec,
  formatRecordsPerSec,
} from './nodeMetrics';

function node(id: string, plugin: string): TopologyConnectorNode {
  return { id, label: id, plugin, processors: [], unavailable: false };
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

function rate(over: Partial<ConnectorRate> = {}): ConnectorRate {
  return {
    plugin: 'file',
    pluginType: 'source',
    componentId: undefined,
    recordsPerSec: undefined,
    bytesPerSec: undefined,
    p95LatencySeconds: undefined,
    ...over,
  };
}

function snapshot(rates: ConnectorRate[], hasComponentId = false): PipelineMetricsSnapshot {
  return { connectorRates: rates, hasComponentId, observedAt: 0 };
}

describe('attributeToNodes', () => {
  it('returns an empty map for a topology with zero connectors, without crashing', () => {
    const result = attributeToNodes(model(), snapshot([]));
    expect(result.size).toBe(0);
  });

  it('returns an empty map when there is no snapshot yet (metrics not loaded)', () => {
    const result = attributeToNodes(model({ sources: [node('s1', 'file')] }), undefined);
    expect(result.size).toBe(0);
  });

  it('single source: unambiguous even without a component_id (only one candidate)', () => {
    const m = model({ sources: [node('s1', 'file')] });
    const snap = snapshot([rate({ plugin: 'file', pluginType: 'source', recordsPerSec: 5 })]);
    const result = attributeToNodes(m, snap);
    const v = result.get('s1');
    expect(v?.recordsPerSec).toBe(5);
    expect(v?.activity).toBe('flowing');
    expect(v?.ambiguous).toBe(false);
    expect(v?.combinedAcrossCount).toBeUndefined();
  });

  it('component_id present: attributes directly to the matching node id, unambiguous even with siblings', () => {
    const m = model({
      sources: [node('s1', 'file'), node('s2', 'file')], // same plugin -> would be ambiguous in fallback
    });
    const snap = snapshot(
      [
        rate({ plugin: 'file', pluginType: 'source', componentId: 's1', recordsPerSec: 10 }),
        rate({ plugin: 'file', pluginType: 'source', componentId: 's2', recordsPerSec: 20 }),
      ],
      true
    );
    const result = attributeToNodes(m, snap);
    expect(result.get('s1')?.recordsPerSec).toBe(10);
    expect(result.get('s1')?.ambiguous).toBe(false);
    expect(result.get('s2')?.recordsPerSec).toBe(20);
    expect(result.get('s2')?.ambiguous).toBe(false);
  });

  it('two sources sharing a plugin, no component_id: ambiguous, combined rate on both', () => {
    const m = model({ sources: [node('s1', 'file'), node('s2', 'file')] });
    const snap = snapshot([rate({ plugin: 'file', pluginType: 'source', recordsPerSec: 30 })]);
    const result = attributeToNodes(m, snap);
    expect(result.get('s1')?.ambiguous).toBe(true);
    expect(result.get('s1')?.combinedAcrossCount).toBe(2);
    expect(result.get('s1')?.recordsPerSec).toBe(30);
    expect(result.get('s2')?.ambiguous).toBe(true);
    expect(result.get('s2')?.combinedAcrossCount).toBe(2);
    expect(result.get('s2')?.recordsPerSec).toBe(30);
  });

  it('two sources with different plugins: each attributed independently, neither ambiguous', () => {
    const m = model({ sources: [node('s1', 'file'), node('s2', 'postgres')] });
    const snap = snapshot([
      rate({ plugin: 'file', pluginType: 'source', recordsPerSec: 1 }),
      rate({ plugin: 'postgres', pluginType: 'source', recordsPerSec: 2 }),
    ]);
    const result = attributeToNodes(m, snap);
    expect(result.get('s1')?.recordsPerSec).toBe(1);
    expect(result.get('s1')?.ambiguous).toBe(false);
    expect(result.get('s2')?.recordsPerSec).toBe(2);
    expect(result.get('s2')?.ambiguous).toBe(false);
  });

  it('a node with no matching rate at all reports "unknown", not a crash or a false 0', () => {
    const m = model({ sources: [node('s1', 'file')] });
    const result = attributeToNodes(m, snapshot([]));
    expect(result.get('s1')).toEqual({
      recordsPerSec: undefined,
      bytesPerSec: undefined,
      p95LatencySeconds: undefined,
      activity: 'unknown',
      slow: false,
      ambiguous: false,
      combinedAcrossCount: undefined,
    });
  });

  it('recordsPerSec === 0 while a rate exists classifies as idle, not unknown', () => {
    const m = model({ destinations: [node('d1', 's3')] });
    const snap = snapshot([rate({ plugin: 's3', pluginType: 'destination', recordsPerSec: 0 })]);
    expect(attributeToNodes(m, snap).get('d1')?.activity).toBe('idle');
  });

  it('p95 above the threshold marks the node slow', () => {
    const m = model({ destinations: [node('d1', 's3')] });
    const snap = snapshot([
      rate({ plugin: 's3', pluginType: 'destination', recordsPerSec: 1, p95LatencySeconds: 1.5 }),
    ]);
    expect(attributeToNodes(m, snap).get('d1')?.slow).toBe(true);
  });

  it('does not attribute anything to "other" (unspecified-type) connectors', () => {
    const m = model({ other: [node('u1', 'file')] });
    const snap = snapshot([rate({ plugin: 'file', pluginType: 'source', recordsPerSec: 5 })]);
    expect(attributeToNodes(m, snap).has('u1')).toBe(false);
  });

  it('a mixed group (one sibling has a direct component_id match, one does not) counts only the fallback siblings, not every node sharing the plugin+type', () => {
    // Not expected on a real (uniform) engine, but the attribution logic must
    // not overstate ambiguity by counting a sibling that already has its own
    // unique, directly-matched rate.
    const m = model({ sources: [node('s1', 'file'), node('s2', 'file'), node('s3', 'file')] });
    const snap = snapshot(
      [
        rate({ plugin: 'file', pluginType: 'source', componentId: 's1', recordsPerSec: 100 }),
        rate({ plugin: 'file', pluginType: 'source', recordsPerSec: 7 }), // fallback, shared by s2 + s3
      ],
      true
    );
    const result = attributeToNodes(m, snap);
    expect(result.get('s1')?.recordsPerSec).toBe(100);
    expect(result.get('s1')?.ambiguous).toBe(false);
    expect(result.get('s2')?.ambiguous).toBe(true);
    expect(result.get('s2')?.combinedAcrossCount).toBe(2); // s2 + s3, NOT 3
    expect(result.get('s3')?.ambiguous).toBe(true);
    expect(result.get('s3')?.combinedAcrossCount).toBe(2);
  });
});

describe('summarizePipelineActivity', () => {
  it('is "unknown" when there is no snapshot yet', () => {
    expect(summarizePipelineActivity(1, undefined).activity).toBe('unknown');
  });

  it('sums records/sec across destination rates only (not source)', () => {
    const snap = snapshot([
      rate({ plugin: 'file', pluginType: 'source', recordsPerSec: 999 }),
      rate({ plugin: 's3', pluginType: 'destination', recordsPerSec: 4 }),
      rate({ plugin: 'kafka', pluginType: 'destination', recordsPerSec: 6 }),
    ]);
    const summary = summarizePipelineActivity(2, snap);
    expect(summary.recordsPerSec).toBe(10);
    expect(summary.activity).toBe('flowing');
  });

  it('flags ambiguousDestinationCount only when >1 destination and no component_id', () => {
    const snap = snapshot(
      [rate({ plugin: 's3', pluginType: 'destination', recordsPerSec: 1 })],
      false
    );
    expect(summarizePipelineActivity(2, snap).ambiguousDestinationCount).toBe(2);
    expect(summarizePipelineActivity(1, snap).ambiguousDestinationCount).toBeUndefined();

    const withComponentId = snapshot(
      [rate({ plugin: 's3', pluginType: 'destination', recordsPerSec: 1, componentId: 'd1' })],
      true
    );
    expect(summarizePipelineActivity(2, withComponentId).ambiguousDestinationCount).toBeUndefined();
  });
});

describe('formatting helpers', () => {
  it('formatRecordsPerSec renders sub-1 rates as "<1 rec/s" rather than rounding to 0', () => {
    expect(formatRecordsPerSec(0.4)).toBe('<1 rec/s');
    expect(formatRecordsPerSec(0)).toBe('0 rec/s');
    expect(formatRecordsPerSec(12.6)).toBe('13 rec/s');
  });

  it('formatBytesPerSec scales units', () => {
    expect(formatBytesPerSec(500)).toBe('500 B/s');
    expect(formatBytesPerSec(2048)).toBe('2.0 KB/s');
    expect(formatBytesPerSec(5 * 1024 * 1024)).toBe('5.0 MB/s');
  });
});
