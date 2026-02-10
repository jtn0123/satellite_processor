import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import JobList from '../components/Jobs/JobList';
import JobMonitor from '../components/Jobs/JobMonitor';

export default function JobsPage() {
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
        <JobMonitor jobId={selectedId} onBack={handleBack} />
      ) : (
        <>
          <div>
            <h1 className="text-2xl font-bold">Jobs</h1>
            <p className="text-slate-400 text-sm mt-1">Monitor and manage processing jobs</p>
          </div>
          <JobList onSelect={handleSelect} />
        </>
      )}
    </div>
  );
}
