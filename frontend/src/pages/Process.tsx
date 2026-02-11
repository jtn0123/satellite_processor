import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ImageGallery from '../components/ImageGallery/ImageGallery';
import ProcessingForm from '../components/Processing/ProcessingForm';
import PresetManager from '../components/Processing/PresetManager';
import { usePageTitle } from '../hooks/usePageTitle';

export default function ProcessPage() {
  usePageTitle('Process');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [presetParams, setPresetParams] = useState<Record<string, unknown> | null>(null);
  const navigate = useNavigate();

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleLoadPreset = useCallback((params: Record<string, unknown>) => {
    setPresetParams(params);
  }, []);

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

      {/* Presets + Processing config */}
      {selected.size > 0 && (
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2">
            <h2 className="text-lg font-semibold mb-4">Configure Processing</h2>
            <ProcessingForm
              selectedImages={Array.from(selected)}
              onJobCreated={() => navigate('/jobs')}
              initialParams={presetParams}
            />
          </div>
          <div>
            <h2 className="text-lg font-semibold mb-4">Presets</h2>
            <PresetManager
              currentParams={{ images: selected.size }}
              onLoadPreset={handleLoadPreset}
            />
          </div>
        </div>
      )}
    </div>
  );
}
