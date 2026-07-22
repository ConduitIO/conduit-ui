import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query';
import axe from 'axe-core';
import type { SchemaV1Pipeline } from '../../api/schema';
import { OperateControls } from './OperateControls';
import '../../tokens/tokens.css';

// Same controllable-mutation approach as usePipelineOperate.test.ts: replace
// the real start/stop mutations with test doubles so a click's mutation
// never actually resolves mid-test unless the test resolves it.
const { getStartImpl, getStopImpl, setStartImpl, setStopImpl } = vi.hoisted(() => {
  let startImpl: () => Promise<void> = () => new Promise(() => undefined);
  let stopImpl: () => Promise<void> = () => new Promise(() => undefined);
  return {
    getStartImpl: () => startImpl,
    getStopImpl: () => stopImpl,
    setStartImpl: (fn: () => Promise<void>) => {
      startImpl = fn;
    },
    setStopImpl: (fn: () => Promise<void>) => {
      stopImpl = fn;
    },
  };
});

vi.mock('../../api/pipelineOperate', () => ({
  useStartPipeline: () => useMutation({ mutationFn: () => getStartImpl()() }),
  useStopPipeline: () => useMutation({ mutationFn: () => getStopImpl()() }),
}));

function pipeline(state: NonNullable<SchemaV1Pipeline['state']>): SchemaV1Pipeline {
  return { id: 'p1', config: { name: 'p1' }, state };
}

function renderControls(state: NonNullable<SchemaV1Pipeline['state']>) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <OperateControls
        pipeline={pipeline(state)}
        query={{ dataUpdatedAt: 0, isError: false, errorUpdatedAt: 0 }}
      />
    </QueryClientProvider>
  );
}

// TanStack schedules the mutationFn call a tick after `.mutate()`, and any
// state update from a fake-timer callback happens outside RTL's fireEvent
// act-wrapping — flush both through `act` so assertions see settled DOM.
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  setStartImpl(() => new Promise(() => undefined));
  setStopImpl(() => new Promise(() => undefined));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('OperateControls — Running: Stop confirms, no Start', () => {
  it('one click arms (no mutation yet); a second click confirms (mutation fires)', async () => {
    const stopMock = vi.fn(() => new Promise<void>(() => undefined));
    setStopImpl(stopMock);
    renderControls({ status: 'STATUS_RUNNING' });
    const button = screen.getByRole('button', { name: 'Stop pipeline' });

    fireEvent.click(button);
    await flush();
    expect(stopMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /click again to confirm/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /click again to confirm/i }));
    await flush();
    expect(stopMock).toHaveBeenCalledTimes(1);
  });

  it('no Start control is rendered while Running', () => {
    renderControls({ status: 'STATUS_RUNNING' });
    expect(screen.queryByRole('button', { name: /start pipeline/i })).toBeNull();
  });

  it('auto-disarms after the confirm window with no second click — no mutation fires', async () => {
    const stopMock = vi.fn(() => new Promise<void>(() => undefined));
    setStopImpl(stopMock);
    renderControls({ status: 'STATUS_RUNNING' });
    fireEvent.click(screen.getByRole('button', { name: 'Stop pipeline' }));
    await flush();
    expect(screen.getByRole('button', { name: /click again to confirm/i })).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByRole('button', { name: 'Stop pipeline' })).toBeTruthy();
    expect(stopMock).not.toHaveBeenCalled();
  });

  it('Escape disarms the confirm', async () => {
    renderControls({ status: 'STATUS_RUNNING' });
    fireEvent.click(screen.getByRole('button', { name: 'Stop pipeline' }));
    await flush();
    const armed = screen.getByRole('button', { name: /click again to confirm/i });
    fireEvent.keyDown(armed, { key: 'Escape' });
    await flush();
    expect(screen.getByRole('button', { name: 'Stop pipeline' })).toBeTruthy();
  });

  it('blur disarms the confirm', async () => {
    renderControls({ status: 'STATUS_RUNNING' });
    fireEvent.click(screen.getByRole('button', { name: 'Stop pipeline' }));
    await flush();
    const armed = screen.getByRole('button', { name: /click again to confirm/i });
    fireEvent.blur(armed);
    await flush();
    expect(screen.getByRole('button', { name: 'Stop pipeline' })).toBeTruthy();
  });
});

describe('OperateControls — Recovering: Stop risk-flagged, no Start', () => {
  it('renders Stop (not disabled) with a force-stop confirm and a tooltip, no Start', async () => {
    renderControls({ status: 'STATUS_RECOVERING' });
    const button = screen.getByRole('button', { name: /stop pipeline/i });
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(screen.queryByRole('button', { name: /start pipeline/i })).toBeNull();

    fireEvent.click(button);
    await flush();
    expect(screen.getByRole('button', { name: /force stop/i })).toBeTruthy();
    expect(screen.getByRole('tooltip')).toBeTruthy();
  });
});

describe('OperateControls — Degraded: "Restart", no confirm', () => {
  it('shows the restart-from-checkpoint note and calls startPipeline on a single click, no Stop', async () => {
    const startMock = vi.fn(() => new Promise<void>(() => undefined));
    setStartImpl(startMock);
    renderControls({ status: 'STATUS_DEGRADED', error: 'boom' });
    expect(screen.getByText(/restarts from the last committed position/i)).toBeTruthy();

    const button = screen.getByRole('button', { name: 'Restart pipeline' });
    expect(screen.queryByRole('button', { name: /stop pipeline/i })).toBeNull();
    fireEvent.click(button);
    await flush();
    expect(startMock).toHaveBeenCalledTimes(1);
  });
});

describe('OperateControls — Stopped: plain Start, no confirm', () => {
  it('renders Start, single click calls startPipeline immediately, no Stop', async () => {
    const startMock = vi.fn(() => new Promise<void>(() => undefined));
    setStartImpl(startMock);
    renderControls({ status: 'STATUS_STOPPED', stoppedReason: 'STOPPED_REASON_USER' });
    const button = screen.getByRole('button', { name: 'Start pipeline' });
    expect(screen.queryByRole('button', { name: /stop pipeline/i })).toBeNull();
    fireEvent.click(button);
    await flush();
    expect(startMock).toHaveBeenCalledTimes(1);
  });
});

describe('OperateControls — Unknown: no controls', () => {
  it('renders nothing for STATUS_UNSPECIFIED', () => {
    const { container } = renderControls({ status: 'STATUS_UNSPECIFIED' });
    expect(container.querySelector('button')).toBeNull();
  });
});

describe('OperateControls — mutation failure surfaces, no fake success', () => {
  it('a rejected stop clears the pending label and shows the error, Stop still available', async () => {
    setStopImpl(() => Promise.reject(new Error('failed precondition')));
    renderControls({ status: 'STATUS_RUNNING' });
    fireEvent.click(screen.getByRole('button', { name: 'Stop pipeline' }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: /click again to confirm/i }));
    await flush();

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/failed precondition/i);
    expect(screen.getByRole('button', { name: 'Stop pipeline' })).toBeTruthy();
  });
});

describe('OperateControls — a11y', () => {
  it('axe clean for a Running row with Stop armed', async () => {
    const { container } = renderControls({ status: 'STATUS_RUNNING' });
    fireEvent.click(screen.getByRole('button', { name: 'Stop pipeline' }));
    await flush();
    // axe-core's internal scheduling needs real timers (fake timers otherwise
    // hang it indefinitely); nothing below depends on the confirm-window timer.
    vi.useRealTimers();
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
