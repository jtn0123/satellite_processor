import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Suspense, lazy } from 'react';
import { Satellite } from 'lucide-react';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import ToastContainer from './components/Toast';
import DevErrorOverlay from './components/DevErrorOverlay';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const JobsPage = lazy(() => import('./pages/Jobs'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const GoesData = lazy(() => import('./pages/GoesData'));
const LiveView = lazy(() => import('./pages/LiveView'));
const Animate = lazy(() => import('./pages/Animate'));
const NotFound = lazy(() => import('./pages/NotFound'));
const SharedFrame = lazy(() => import('./pages/SharedFrame'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
      gcTime: 5 * 60_000,
    },
  },
});

function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-50 dark:bg-space-950 gap-4">
      <Satellite className="w-10 h-10 text-primary animate-pulse" />
      <div className="text-sm text-gray-500 dark:text-slate-400 font-medium">Loading Satellite Tracker…</div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            <Route path="shared/:token" element={<ErrorBoundary><SharedFrame /></ErrorBoundary>} />
            <Route element={<Layout />}>
              <Route index element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
              <Route path="live" element={<ErrorBoundary><LiveView /></ErrorBoundary>} />
              <Route path="animate" element={<ErrorBoundary><Animate /></ErrorBoundary>} />
              <Route path="goes" element={<ErrorBoundary><GoesData /></ErrorBoundary>} />
              <Route path="jobs" element={<ErrorBoundary><JobsPage /></ErrorBoundary>} />
              <Route path="settings" element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />
              {/* Legacy redirects */}
              <Route path="upload" element={<Navigate to="/settings" replace />} />
              <Route path="process" element={<Navigate to="/settings" replace />} />
              <Route path="presets" element={<Navigate to="/settings" replace />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
        <ToastContainer />
        {import.meta.env.DEV && <DevErrorOverlay />}
      </BrowserRouter>
    </QueryClientProvider>
  );
}
