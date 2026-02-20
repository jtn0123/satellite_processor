import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { reportError, onError } from './utils/errorReporter';
import { showToast } from './utils/toast';

// ── Global error handlers ──────────────────────────────────────────
globalThis.addEventListener('error', (event) => {
  reportError(event.error ?? event.message, 'window.onerror');
});

globalThis.addEventListener('unhandledrejection', (event) => {
  reportError(event.reason, 'unhandledrejection');
});

// ── Toast integration: show user-visible feedback for every error ──
onError((report) => {
  const label = report.context ?? 'Error';
  showToast('error', `${label}: ${report.message}`.slice(0, 200));
});

// ── Render ──────────────────────────────────────────────────────────
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
