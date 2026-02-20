import { useState, useEffect, useCallback } from 'react';
import { Bug, X, Trash2 } from 'lucide-react';
import { onError, getErrorLog, clearErrorLog, type ErrorReport } from '../utils/errorReporter';

/**
 * Dev-only floating error badge + log panel.
 * Shows in bottom-left corner during development.
 */
export default function DevErrorOverlay() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<readonly ErrorReport[]>([]);

  useEffect(() => {
    return onError(() => {
      setCount((c) => c + 1);
      if (open) setErrors(getErrorLog());
    });
  }, [open]);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      if (!prev) setErrors(getErrorLog());
      return !prev;
    });
  }, []);

  const handleClear = useCallback(() => {
    clearErrorLog();
    setCount(0);
    setErrors([]);
  }, []);

  return (
    <>
      {/* Badge */}
      <button
        onClick={toggle}
        className="fixed bottom-4 left-4 z-[9999] flex items-center gap-1.5 px-3 py-2 rounded-full shadow-lg text-xs font-mono bg-gray-900 text-white hover:bg-gray-700 transition-colors"
        title="Error log"
      >
        <Bug className="w-3.5 h-3.5" />
        {count > 0 && (
          <span className="bg-red-500 text-white rounded-full px-1.5 min-w-[1.25rem] text-center">
            {count}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-14 left-4 z-[9999] w-[420px] max-h-[50vh] bg-gray-900 text-gray-100 rounded-xl shadow-2xl border border-gray-700 flex flex-col overflow-hidden text-xs font-mono">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 bg-gray-800">
            <span className="font-semibold">Errors ({errors.length})</span>
            <div className="flex gap-1">
              <button onClick={handleClear} className="p-1 hover:text-red-400" title="Clear"><Trash2 className="w-3.5 h-3.5" /></button>
              <button onClick={toggle} className="p-1 hover:text-white" title="Close"><X className="w-3.5 h-3.5" /></button>
            </div>
          </div>
          <div className="overflow-y-auto p-2 space-y-2 flex-1">
            {errors.length === 0 && <p className="text-gray-500 text-center py-4">No errors captured</p>}
            {errors.map((e, i) => (
              <div key={`${e.timestamp}-${i}`} className="bg-gray-800 rounded p-2 space-y-0.5">
                <div className="text-red-400 font-semibold">{e.context ?? 'unknown'}</div>
                <div className="text-gray-300 break-words">{e.message}</div>
                <div className="text-gray-500">{e.timestamp}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
