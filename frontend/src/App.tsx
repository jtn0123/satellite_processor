import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Suspense, lazy } from 'react';
import Layout from './components/Layout';
import ToastContainer from './components/Toast';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const UploadPage = lazy(() => import('./pages/Upload'));
const ProcessPage = lazy(() => import('./pages/Process'));
const JobsPage = lazy(() => import('./pages/Jobs'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const GoesData = lazy(() => import('./pages/GoesData'));
const PresetsPage = lazy(() => import('./pages/Presets'));
const NotFound = lazy(() => import('./pages/NotFound'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
});

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="upload" element={<UploadPage />} />
              <Route path="process" element={<ProcessPage />} />
              <Route path="jobs" element={<JobsPage />} />
              <Route path="goes" element={<GoesData />} />
              <Route path="presets" element={<PresetsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
        <ToastContainer />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
