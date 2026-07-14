import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { axe } from 'vitest-axe';
import { App } from './App';
import '../tokens/tokens.css';

function renderApp(initialPath = '/') {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('App shell', () => {
  it('renders the brand and the fleet placeholder at /', () => {
    renderApp('/');
    expect(screen.getByRole('link', { name: 'Conduit' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Pipelines' })).toBeTruthy();
  });

  it('renders the pipeline detail placeholder at /pipelines/:id', () => {
    renderApp('/pipelines/abc');
    expect(screen.getByRole('heading', { name: 'Pipeline' })).toBeTruthy();
  });

  it('has no axe accessibility violations', async () => {
    const { container } = renderApp('/');
    // color-contrast requires a real layout/canvas engine jsdom lacks; it's
    // verified with real-browser tooling, not here.
    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });

  it('applies design tokens (a namespaced custom property resolves)', () => {
    // tokens.css sets --conduit-font-sans on :root; prove it's imported/applied.
    document.documentElement.setAttribute('data-test', 'tokens');
    const resolved = getComputedStyle(document.documentElement).getPropertyValue(
      '--conduit-font-sans'
    );
    expect(resolved.trim().length).toBeGreaterThan(0);
  });
});
