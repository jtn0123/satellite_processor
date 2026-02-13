import { useCallback, useRef, useState } from 'react';
import { Upload, CheckCircle2, AlertCircle } from 'lucide-react';
import api from '../../api/client';
import { useQueryClient } from '@tanstack/react-query';

export default function UploadZone() {
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<
    { name: string; progress: number; status: 'uploading' | 'done' | 'error' }[]
  >([]);
  const qc = useQueryClient();
  const idxRef = useRef(0);

  const updateUpload = useCallback(
    (idx: number, patch: Partial<{ progress: number; status: 'uploading' | 'done' | 'error' }>) =>
      setUploads((prev) => prev.map((u, i) => (i === idx ? { ...u, ...patch } : u))),
    []
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files).filter((f) =>
        /\.(png|tiff?|jpg|jpeg)$/i.test(f.name)
      );
      // Reset index when starting a new batch to stay in sync with uploads array
      idxRef.current = 0;
      setUploads([]);
      for (const file of fileArray) {
        const idx = idxRef.current++;
        setUploads((prev) => [...prev, { name: file.name, progress: 0, status: 'uploading' }]);
        const fd = new FormData();
        fd.append('file', file);
        try {
          await api.post('/images/upload', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (e) => {
              const pct = e.total ? Math.round((e.loaded / e.total) * 100) : 0;
              updateUpload(idx, { progress: pct });
            },
          });
          updateUpload(idx, { progress: 100, status: 'done' });
          qc.invalidateQueries({ queryKey: ['images'] });
        } catch (err) {
          console.error(`Upload failed for ${file.name}:`, err);
          updateUpload(idx, { status: 'error' });
        }
      }
    },
    [qc, updateUpload]
  );

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const input = document.createElement('input');
            input.type = 'file';
            input.multiple = true;
            input.accept = '.png,.tif,.tiff,.jpg,.jpeg';
            input.onchange = () => input.files && handleFiles(input.files);
            input.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.multiple = true;
          input.accept = '.png,.tif,.tiff,.jpg,.jpeg';
          input.onchange = () => input.files && handleFiles(input.files);
          input.click();
        }}
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
          dragging
            ? 'border-primary bg-primary/5'
            : 'border-gray-200 dark:border-slate-700 hover:border-slate-500 bg-gray-100/50 dark:bg-slate-800/50'
        }`}
      >
        <Upload className="w-10 h-10 mx-auto mb-3 text-gray-500 dark:text-slate-400" />
        <p className="text-sm text-gray-600 dark:text-slate-300">
          Drag & drop satellite images here, or click to browse
        </p>
        <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">PNG, TIFF, JPEG supported · Max file size: 500 MB</p>
      </div>

      {uploads.length > 0 && (
        <div className="space-y-2">
          {uploads.map((u) => (
            <div key={u.name} className="flex items-center gap-3 bg-gray-100 dark:bg-slate-800 rounded-lg px-4 py-2">
              {u.status === 'done' && <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />}
              {u.status === 'error' && <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />}
              {u.status !== 'done' && u.status !== 'error' && (
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
              )}
              <span className="text-sm truncate flex-1">{u.name}</span>
              <span className="text-xs text-gray-500 dark:text-slate-400">{u.progress}%</span>
              <div className="w-24 h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${u.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
