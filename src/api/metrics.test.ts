import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseMetricsText, sample, samplesMatching, fetchMetrics } from './metrics';

describe('parseMetricsText', () => {
  it('parses a gauge with no labels', () => {
    const parsed = parseMetricsText('conduit_info 1\n');
    expect(sample(parsed, 'conduit_info', {})).toEqual({ labels: {}, value: 1 });
  });

  it('parses a labeled counter', () => {
    const text = 'conduit_pipelines{status="running"} 3\n';
    const parsed = parseMetricsText(text);
    expect(sample(parsed, 'conduit_pipelines', { status: 'running' })).toEqual({
      labels: { status: 'running' },
      value: 3,
    });
  });

  it('parses a histogram as separate _bucket/_sum/_count entries, not a merged type', () => {
    const text = [
      '# HELP conduit_connector_bytes bytes',
      '# TYPE conduit_connector_bytes histogram',
      'conduit_connector_bytes_bucket{pipeline_name="p1",plugin="file",type="source",le="1024"} 5',
      'conduit_connector_bytes_bucket{pipeline_name="p1",plugin="file",type="source",le="+Inf"} 7',
      'conduit_connector_bytes_sum{pipeline_name="p1",plugin="file",type="source"} 4096',
      'conduit_connector_bytes_count{pipeline_name="p1",plugin="file",type="source"} 7',
      '',
    ].join('\n');
    const parsed = parseMetricsText(text);

    expect(parsed.has('conduit_connector_bytes')).toBe(false); // no synthetic merged name
    expect(samplesMatching(parsed, 'conduit_connector_bytes_bucket')).toHaveLength(2);
    expect(
      sample(parsed, 'conduit_connector_bytes_bucket', {
        pipeline_name: 'p1',
        plugin: 'file',
        type: 'source',
        le: '+Inf',
      })
    ).toEqual({
      labels: { pipeline_name: 'p1', plugin: 'file', type: 'source', le: '+Inf' },
      value: 7,
    });
    expect(
      sample(parsed, 'conduit_connector_bytes_sum', {
        pipeline_name: 'p1',
        plugin: 'file',
        type: 'source',
      })?.value
    ).toBe(4096);
    expect(
      sample(parsed, 'conduit_connector_bytes_count', {
        pipeline_name: 'p1',
        plugin: 'file',
        type: 'source',
      })?.value
    ).toBe(7);
  });

  it('skips malformed lines without throwing', () => {
    const text = [
      'conduit_ok{a="1"} 5',
      'this is not a metric line at all',
      'conduit_unterminated{a="1" 5', // missing closing brace
      'conduit_no_value{a="1"}',
      '',
    ].join('\n');
    expect(() => parseMetricsText(text)).not.toThrow();
    const parsed = parseMetricsText(text);
    expect(sample(parsed, 'conduit_ok', { a: '1' })?.value).toBe(5);
    expect(parsed.has('conduit_unterminated')).toBe(false);
    expect(parsed.has('conduit_no_value')).toBe(false);
  });

  it('ignores blank lines and comments, and does not require # TYPE', () => {
    const text = ['', '# just a comment, no TYPE line', 'conduit_x 1', ''].join('\n');
    const parsed = parseMetricsText(text);
    expect(sample(parsed, 'conduit_x', {})?.value).toBe(1);
  });

  it('parses +Inf/-Inf/NaN values', () => {
    const text = ['conduit_a 1', 'conduit_b{x="1"} +Inf', 'conduit_c NaN', ''].join('\n');
    const parsed = parseMetricsText(text);
    expect(sample(parsed, 'conduit_b', { x: '1' })?.value).toBe(Infinity);
    expect(sample(parsed, 'conduit_c', {})?.value).toBeNaN();
  });

  it('keeps duplicate label sets as separate samples rather than crashing or merging', () => {
    const text = ['conduit_dup{a="1"} 1', 'conduit_dup{a="1"} 2', ''].join('\n');
    const parsed = parseMetricsText(text);
    expect(samplesMatching(parsed, 'conduit_dup', { a: '1' })).toHaveLength(2);
  });
});

describe('sample vs samplesMatching', () => {
  it('sample returns undefined (never picks one) when more than one sample matches', () => {
    const parsed = parseMetricsText(
      ['conduit_dup{a="1"} 1', 'conduit_dup{a="1"} 2', ''].join('\n')
    );
    expect(sample(parsed, 'conduit_dup', { a: '1' })).toBeUndefined();
    expect(samplesMatching(parsed, 'conduit_dup', { a: '1' })).toHaveLength(2);
  });

  it('sample and samplesMatching return nothing for an absent metric name', () => {
    const parsed = parseMetricsText('conduit_present 1\n');
    expect(sample(parsed, 'conduit_absent', {})).toBeUndefined();
    expect(samplesMatching(parsed, 'conduit_absent')).toEqual([]);
  });
});

describe('fetchMetrics', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('parses a successful text response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('conduit_x 42\n', { status: 200 })))
    );
    const parsed = await fetchMetrics('http://engine');
    expect(sample(parsed, 'conduit_x', {})?.value).toBe(42);
  });

  it('throws with the status on a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 503 })))
    );
    await expect(fetchMetrics('http://engine')).rejects.toThrow(/HTTP 503/);
  });
});
