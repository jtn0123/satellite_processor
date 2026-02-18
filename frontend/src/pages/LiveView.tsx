import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { Radio, ChevronRight } from 'lucide-react';
import { usePageTitle } from '../hooks/usePageTitle';
import Skeleton from '../components/GoesData/Skeleton';

const LiveTab = lazy(() => import('../components/GoesData/LiveTab'));

export default function LiveView() {
  usePageTitle('Live View');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Radio className="w-7 h-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Live View</h1>
          <nav className="flex items-center gap-1 text-sm text-gray-500 dark:text-slate-400">
            <Link to="/" className="hover:text-gray-900 dark:hover:text-white transition-colors">Dashboard</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-gray-900 dark:text-white">Live View</span>
          </nav>
        </div>
      </div>

      <Suspense fallback={<div className="space-y-4"><Skeleton variant="card" /><Skeleton variant="card" /></div>}>
        <LiveTab />
      </Suspense>
    </div>
  );
}
