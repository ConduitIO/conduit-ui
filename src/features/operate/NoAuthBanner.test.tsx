import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { NoAuthBanner } from './NoAuthBanner';
import '../../tokens/tokens.css';

afterEach(cleanup);

describe('NoAuthBanner', () => {
  it('renders a persistent, polite status banner naming the risk', () => {
    render(<NoAuthBanner />);
    const banner = screen.getByRole('status');
    expect(banner.textContent).toMatch(/no auth configured/i);
    expect(banner.textContent).toMatch(/start or stop pipelines/i);
  });

  it('can be dismissed per-tab (not persisted) — a fresh mount shows it again', () => {
    const { unmount } = render(<NoAuthBanner />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByRole('status')).toBeNull();
    unmount();

    render(<NoAuthBanner />);
    expect(screen.getByRole('status')).toBeTruthy();
  });
});
