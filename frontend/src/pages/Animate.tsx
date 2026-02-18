import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, ChevronRight } from 'lucide-react';
import { usePageTitle } from '../hooks/usePageTitle';
import Skeleton from '../components/GoesData/Skeleton';

const AnimateTab = lazy(() => import('../components/Animation/AnimateTab'));

export default function Animate() {
  usePageTitle('Animate');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Sparkles className="w-7 h-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Animate</h1>
          <nav className="flex items-center gap-1 text-sm text-gray-500 dark:text-slate-400">
            <Link to="/" className="hover:text-gray-900 dark:hover:text-white transition-colors">Dashboard</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-gray-900 dark:text-white">Animate</span>
          </nav>
        </div>
      </div>

      <Suspense fallback={<div className="space-y-4"><Skeleton variant="card" /><Skeleton variant="card" /></div>}>
        <AnimateTab />
      </Suspense>
    </div>
  );
}
