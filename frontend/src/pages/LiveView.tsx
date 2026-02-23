import { lazy, Suspense, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Radio, ChevronRight } from 'lucide-react';
import { usePageTitle } from '../hooks/usePageTitle';
import Skeleton from '../components/GoesData/Skeleton';

const LiveTab = lazy(() => import('../components/GoesData/LiveTab'));

export default function LiveView() {
  usePageTitle('Live');
  const [monitoring, setMonitoring] = useState(false);

  const handleMonitorChange = useCallback((active: boolean) => {
    setMonitoring(active);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Radio className="w-7 h-7 text-primary" />
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Live</h1>
            {monitoring && (
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-400/30" data-testid="monitor-header-indicator">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-emerald-400 font-medium">Monitoring</span>
              </span>
            )}
          </div>
          <nav className="flex items-center gap-1 text-sm text-gray-500 dark:text-slate-400">
            <Link to="/" className="hover:text-gray-900 dark:hover:text-white transition-colors">Home</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-gray-900 dark:text-white">Live</span>
          </nav>
        </div>
      </div>

      <Suspense fallback={<div className="space-y-4"><Skeleton variant="card" /><Skeleton variant="card" /></div>}>
        <LiveTab onMonitorChange={handleMonitorChange} />
      </Suspense>
    </div>
  );
}
