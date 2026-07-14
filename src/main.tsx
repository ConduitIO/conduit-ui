import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/App';
import './tokens/tokens.css';
import './app/app.css';

// TanStack Query is the data layer for the design doc's multi-actor
// reconciliation + optimistic-update requirements (Decision 6). Wired here in the
// scaffold so UI-2+ build on it rather than ad-hoc fetch+useEffect.
const queryClient = new QueryClient();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
