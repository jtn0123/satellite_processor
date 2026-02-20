import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Trash2, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import api from '../api/client';

interface ErrorItem {
  id: number;
  message: string;
  stack: string | null;
  context: Record<string, unknown> | null;
  url: string | null;
  user_agent: string | null;
  client_ip: string | null;
  created_at: string;
}

interface ErrorListResponse {
  items: ErrorItem[];
  total: number;
  page: number;
  per_page: number;
}

const AUTO_REFRESH_MS = 30_000;

export default function ErrorDashboard() {
  const [errors, setErrors] = useState<ErrorItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchErrors = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const res = await api.get<ErrorListResponse>('/errors', { params: { page: p, per_page: 50 } });
      setErrors(res.data.items);
      setTotal(res.data.total);
    } catch {
      // Silently fail — we're on the error dashboard, ironic to error here
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchErrors(page);
  }, [page, fetchErrors]);

  // Auto-refresh
  useEffect(() => {
    const timer = setInterval(() => fetchErrors(page), AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [page, fetchErrors]);

  const handleClear = async () => {
    if (!confirm('Clear all error logs?')) return;
    try {
      await api.delete('/errors');
      setErrors([]);
      setTotal(0);
      setPage(1);
    } catch {
      // ignore
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  const totalPages = Math.max(1, Math.ceil(total / 50));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 text-red-500" />
          <h1 className="text-2xl font-bold">Error Logs</h1>
          <span className="text-sm text-gray-500 dark:text-slate-400">({total} total)</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchErrors(page)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-space-800 hover:bg-gray-200 dark:hover:bg-space-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Clear All
          </button>
        </div>
      </div>

      {errors.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-slate-400">
          <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No errors recorded</p>
        </div>
      ) : (
        <div className="space-y-2">
          {errors.map((err) => (
            <div
              key={err.id}
              className="border border-gray-200 dark:border-space-700 rounded-lg overflow-hidden"
            >
              <button
                onClick={() => toggleExpand(err.id)}
                className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-space-800/50 transition-colors"
              >
                <span className="mt-0.5 flex-shrink-0">
                  {expandedId === err.id ? (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400 mb-1">
                    <time>{new Date(err.created_at).toLocaleString()}</time>
                    {err.url && (
                      <span className="truncate max-w-xs text-xs bg-gray-100 dark:bg-space-800 px-1.5 py-0.5 rounded">
                        {err.url}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-mono text-red-600 dark:text-red-400 truncate">
                    {err.message}
                  </p>
                </div>
              </button>

              {expandedId === err.id && (
                <div className="px-4 pb-4 space-y-3 border-t border-gray-100 dark:border-space-700/50 bg-gray-50/50 dark:bg-space-800/30">
                  {err.stack && (
                    <div className="mt-3">
                      <h4 className="text-xs font-semibold text-gray-500 dark:text-slate-400 mb-1">Stack Trace</h4>
                      <pre className="text-xs font-mono bg-gray-100 dark:bg-space-900 p-3 rounded overflow-x-auto max-h-64 whitespace-pre-wrap text-gray-700 dark:text-slate-300">
                        {err.stack}
                      </pre>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    {err.user_agent && (
                      <div>
                        <span className="font-semibold text-gray-500 dark:text-slate-400">User Agent</span>
                        <p className="text-gray-700 dark:text-slate-300 truncate">{err.user_agent}</p>
                      </div>
                    )}
                    {err.client_ip && (
                      <div>
                        <span className="font-semibold text-gray-500 dark:text-slate-400">Client IP</span>
                        <p className="text-gray-700 dark:text-slate-300">{err.client_ip}</p>
                      </div>
                    )}
                    {err.context && (
                      <div className="col-span-2">
                        <span className="font-semibold text-gray-500 dark:text-slate-400">Context</span>
                        <pre className="text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-space-900 p-2 rounded mt-1 overflow-x-auto">
                          {JSON.stringify(err.context, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 dark:bg-space-800 disabled:opacity-50 hover:bg-gray-200 dark:hover:bg-space-700 transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500 dark:text-slate-400">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 dark:bg-space-800 disabled:opacity-50 hover:bg-gray-200 dark:hover:bg-space-700 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
