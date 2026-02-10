import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ImageGallery from '../components/ImageGallery/ImageGallery';
import ProcessingForm from '../components/Processing/ProcessingForm';

export default function ProcessPage() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold">Process Images</h1>
        <p className="text-slate-400 text-sm mt-1">
          Select images and configure processing parameters
        </p>
      </div>

      {/* Image selection */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            Select Images{' '}
            <span className="text-sm text-slate-400 font-normal">
              ({selected.size} selected)
            </span>
          </h2>
          {selected.size > 0 && (
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs text-slate-400 hover:text-white"
            >
              Clear selection
            </button>
          )}
        </div>
        <ImageGallery selectable selected={selected} onToggle={toggle} />
      </div>

      {/* Processing config */}
      {selected.size > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Configure Processing</h2>
          <ProcessingForm
            selectedImages={Array.from(selected)}
            onJobCreated={() => navigate('/jobs')}
          />
        </div>
      )}
    </div>
  );
}
