import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, within, cleanup, fireEvent } from '@testing-library/react';
import axe from 'axe-core';
import type { SchemaV1Record } from '../../../api/schema';
import type { Stage } from './stages';
import type { StageBuffer } from './useStageStreams';
import { Drawer } from './Drawer';
import '../../../tokens/tokens.css';

function stage(id: string, over: Partial<Stage> = {}): Stage {
  return { id, label: id, componentId: id, inspectKind: 'connector', ...over };
}

function buffer(records: SchemaV1Record[]): StageBuffer {
  const byPosition = new Map<string, SchemaV1Record>();
  for (const r of records) if (r.position) byPosition.set(r.position, r);
  return { status: 'live', records, byPosition, malformedFrameCount: 0 };
}

afterEach(cleanup);

describe('Drawer — AC4: frozen record opened, fully inspected', () => {
  const record: SchemaV1Record = {
    position: 'cG9zMQ==',
    operation: 'OPERATION_UPDATE',
    metadata: { 'conduit.source.plugin': 'postgres' },
    key: { rawData: btoa('id-123') },
    payload: { after: { structuredData: { email: 'a@example.com' } as never } },
  };

  it('renders position, operation, key, payload, and metadata — a fully inspectable record', () => {
    render(
      <Drawer
        record={record}
        stages={[stage('src1')]}
        stageBuffers={new Map([['src1', buffer([record])]])}
        onClose={() => {}}
      />
    );
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('id-123')).toBeTruthy();
    expect(within(dialog).getByText(/a@example\.com/)).toBeTruthy();
    expect(within(dialog).getByText('postgres')).toBeTruthy();
    expect(within(dialog).getByText('OPERATION_UPDATE')).toBeTruthy();
    expect(within(dialog).getByText(record.position as string)).toBeTruthy();
  });

  it('a large payload is truncated with a "Show full record" control that reveals the rest', () => {
    const bigValue = 'x'.repeat(9000);
    const bigRecord: SchemaV1Record = {
      position: 'big1',
      payload: { after: { rawData: btoa(bigValue) } },
    };
    render(
      <Drawer
        record={bigRecord}
        stages={[stage('src1')]}
        stageBuffers={new Map([['src1', buffer([bigRecord])]])}
        onClose={() => {}}
      />
    );
    const dialog = screen.getByRole('dialog');
    const button = within(dialog).getByRole('button', { name: /show full record/i });
    expect(dialog.textContent?.includes(bigValue)).toBe(false);
    fireEvent.click(button);
    expect(dialog.textContent?.includes(bigValue)).toBe(true);
    expect(within(dialog).getByRole('button', { name: /show truncated/i })).toBeTruthy();
  });

  it('a record with no position shows an explicit "cannot diff across stages" note, not a blank field', () => {
    const noPos: SchemaV1Record = { operation: 'OPERATION_CREATE' };
    render(
      <Drawer
        record={noPos}
        stages={[stage('src1')]}
        stageBuffers={new Map([['src1', buffer([])]])}
        onClose={() => {}}
      />
    );
    expect(screen.getByText(/cannot diff across stages/i)).toBeTruthy();
  });
});

describe('Drawer — per-stage diff (AC4)', () => {
  const before: SchemaV1Record = {
    position: 'p1',
    payload: {
      after: {
        structuredData: {
          email: 'old@example.com',
          dropped_field: 'gone-soon',
          stable: 'same',
        } as never,
      },
    },
  };
  const after: SchemaV1Record = {
    position: 'p1',
    payload: {
      after: {
        structuredData: {
          email: 'new@example.com',
          added_field: 'brand-new',
          stable: 'same',
        } as never,
      },
    },
  };

  const stages = [
    stage('source'),
    stage('redact', { inspectKind: 'processor-out', label: 'redact (out)' }),
  ];

  function renderWithDiff(showUnchangedInitially = false) {
    const stageBuffers = new Map<string, StageBuffer>([
      ['source', buffer([before])],
      ['redact', buffer([after])],
    ]);
    render(
      <Drawer record={after} stages={stages} stageBuffers={stageBuffers} onClose={() => {}} />
    );
    if (showUnchangedInitially) {
      fireEvent.click(screen.getByRole('checkbox', { name: /show unchanged/i }));
    }
  }

  it('the first (source) stage renders as a baseline — no diff markers', () => {
    renderWithDiff();
    const dialog = screen.getByRole('dialog');
    const sourceItem = within(dialog).getByText('source').closest('li') as HTMLElement;
    expect(within(sourceItem).getByText('baseline')).toBeTruthy();
  });

  it('the second stage shows exactly added/changed/removed by default, no unchanged rows', () => {
    renderWithDiff();
    const dialog = screen.getByRole('dialog');
    const redactItem = within(dialog).getByText('redact (out)').closest('li') as HTMLElement;

    expect(within(redactItem).getByText('payload.after.added_field')).toBeTruthy();
    expect(within(redactItem).getByText('payload.after.email')).toBeTruthy();
    expect(within(redactItem).getByText('payload.after.dropped_field')).toBeTruthy();
    // "stable" is unchanged and hidden by default.
    expect(within(redactItem).queryByText('payload.after.stable')).toBeNull();

    const addedRow = within(redactItem).getByText('payload.after.added_field').closest('li');
    expect(addedRow?.getAttribute('data-diff-kind')).toBe('added');
    const changedRow = within(redactItem).getByText('payload.after.email').closest('li');
    expect(changedRow?.getAttribute('data-diff-kind')).toBe('changed');
    const removedRow = within(redactItem).getByText('payload.after.dropped_field').closest('li');
    expect(removedRow?.getAttribute('data-diff-kind')).toBe('removed');
  });

  it('"show unchanged fields" reveals the stable field too', () => {
    renderWithDiff(true);
    const dialog = screen.getByRole('dialog');
    const redactItem = within(dialog).getByText('redact (out)').closest('li') as HTMLElement;
    expect(within(redactItem).getByText('payload.after.stable')).toBeTruthy();
  });

  it('a stage that never observed this position renders a "not observed" gap, never as removed', () => {
    const stageBuffers = new Map<string, StageBuffer>([
      ['source', buffer([before])],
      ['redact', buffer([])], // never saw p1
    ]);
    render(
      <Drawer record={before} stages={stages} stageBuffers={stageBuffers} onClose={() => {}} />
    );
    const dialog = screen.getByRole('dialog');
    const redactItem = within(dialog).getByText('redact (out)').closest('li') as HTMLElement;
    expect(within(redactItem).getByText(/not observed at this stage yet/i)).toBeTruthy();
    expect(redactItem.querySelector('[data-diff-kind="removed"]')).toBeNull();
  });
});

describe('Drawer — a11y and focus', () => {
  it('has no axe violations', async () => {
    const record: SchemaV1Record = { position: 'p1' };
    const { container } = render(
      <Drawer
        record={record}
        stages={[stage('src1')]}
        stageBuffers={new Map([['src1', buffer([record])]])}
        onClose={() => {}}
      />
    );
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });

  it('moves focus to the close button on mount', () => {
    const record: SchemaV1Record = { position: 'p1' };
    render(
      <Drawer
        record={record}
        stages={[stage('src1')]}
        stageBuffers={new Map([['src1', buffer([record])]])}
        onClose={() => {}}
      />
    );
    expect(document.activeElement?.textContent).toBe('Close');
  });

  it('clicking the backdrop (not the dialog content) calls onClose', () => {
    let closed = false;
    const record: SchemaV1Record = { position: 'p1' };
    const { container } = render(
      <Drawer
        record={record}
        stages={[stage('src1')]}
        stageBuffers={new Map([['src1', buffer([record])]])}
        onClose={() => {
          closed = true;
        }}
      />
    );
    const overlay = container.firstElementChild as HTMLElement;
    fireEvent.click(overlay);
    expect(closed).toBe(true);
  });

  it('clicking inside the dialog does not close it', () => {
    let closed = false;
    const record: SchemaV1Record = { position: 'p1' };
    render(
      <Drawer
        record={record}
        stages={[stage('src1')]}
        stageBuffers={new Map([['src1', buffer([record])]])}
        onClose={() => {
          closed = true;
        }}
      />
    );
    fireEvent.click(screen.getByRole('dialog'));
    expect(closed).toBe(false);
  });

  it('pressing Escape calls onClose', () => {
    let closed = false;
    const record: SchemaV1Record = { position: 'p1' };
    render(
      <Drawer
        record={record}
        stages={[stage('src1')]}
        stageBuffers={new Map([['src1', buffer([record])]])}
        onClose={() => {
          closed = true;
        }}
      />
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closed).toBe(true);
  });
});
