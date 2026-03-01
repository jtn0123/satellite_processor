import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import JobList from '../components/Jobs/JobList';
import JobMonitor from '../components/Jobs/JobMonitor';
import { usePageTitle } from '../hooks/usePageTitle';

export default function JobsPage() {
  usePageTitle('Jobs');
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('id'));

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setSearchParams({ id });
  };

  const handleBack = () => {
    setSelectedId(null);
    setSearchParams({});
  };

  return (
    <div className="space-y-6 max-w-6xl">
      {selectedId ? (
        <div key={selectedId} className="panel-enter">
          <JobMonitor jobId={selectedId} onBack={handleBack} />
        </div>
      ) : (
        <>
          <div>
            <nav aria-label="Breadcrumb" className="hidden md:flex items-center gap-1 text-sm text-gray-500 dark:text-slate-400 mb-1">
              <Link to="/" className="hover:text-gray-900 dark:hover:text-white transition-colors">Home</Link>
              <ChevronRight className="w-3.5 h-3.5" />
              <span aria-current="page" className="text-gray-900 dark:text-white">Jobs</span>
            </nav>
            <h1 className="text-2xl font-bold">Jobs</h1>
            <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">Monitor and manage processing jobs</p>
          </div>
          <JobList onSelect={handleSelect} />
        </>
      )}
    </div>
  );
}
