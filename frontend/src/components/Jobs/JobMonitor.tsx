import { useState, useEffect, useRef, useCallback } from 'react';
import { useJob } from '../../hooks/useApi';
import { useWebSocket } from '../../hooks/useWebSocket';
import type { JobLogEntry } from '../../hooks/useWebSocket';
import VideoPlayer from '../VideoPlayer/VideoPlayer';
import {
  Download,
  ArrowLeft,
  Copy,
  Check,
  X,
  RefreshCw,
  Trash2,
  ArrowDownToLine,
  Filter,
} from 'lucide-react';
import api from '../../api/client';

/* ── Helpers ─────────────────────────────────────────────── */

function statusBadgeClass(status: string): string {
  if (status === 'completed') return 'bg-green-400/10 text-green-400';
  if (status === 'completed_partial') return 'bg-amber-400/10 text-amber-400';
  if (status === 'failed') return 'bg-red-400/10 text-red-400';
  if (status === 'cancelled') return 'bg-slate-400/10 text-slate-400';
  if (status === 'processing') return 'bg-blue-400/10 text-blue-400';
  return 'bg-yellow-400/10 text-yellow-400';
}

function progressBarColor(status: string): string {
  if (status === 'failed') return 'bg-red-500';
  if (status === 'completed_partial') return 'bg-amber-500';
  return 'bg-primary';
}

function timelineDotColor(step: { label: string; done: boolean }): string {
  if (!step.done) return 'bg-slate-600';
  if (step.label === 'Failed') return 'bg-red-400';
  if (step.label === 'Partial') return 'bg-amber-400';
  return 'bg-green-400';
}

function isTerminalStatus(status: string): boolean {
  return status === 'completed' || status === 'completed_partial' || status === 'failed' || status === 'cancelled';
}

function computeDuration(
  job: { completed_at?: string; started_at?: string; created_at: string } | null,
  status: string,
  now: number,
): number {
  if (!job) return 0;
  if (isTerminalStatus(status)) {
    return job.completed_at
      ? new Date(job.completed_at).getTime() - new Date(job.started_at ?? job.created_at).getTime()
      : 0;
  }
  return now - new Date(job.started_at ?? job.created_at).getTime();
}

function buildTimelineSteps(
  job: { created_at: string; started_at?: string; completed_at?: string } | null,
  status: string,
): Array<{ label: string; time: string | null; done: boolean }> {
  if (!job) return [];
  const steps: Array<{ label: string; time: string | null; done: boolean }> = [
    { label: 'Created', time: job.created_at, done: true },
    { label: 'Started', time: job.started_at ?? null, done: !!job.started_at },
  ];
  if (status === 'failed') {
    steps.push({ label: 'Failed', time: job.completed_at ?? null, done: true });
  } else if (status === 'cancelled') {
    steps.push({ label: 'Cancelled', time: job.completed_at ?? null, done: true });
  } else if (status === 'completed_partial') {
    steps.push({ label: 'Partial', time: job.completed_at ?? null, done: true });
  } else {
    steps.push({ label: 'Completed', time: job.completed_at ?? null, done: status === 'completed' });
  }
  return steps;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return '<1s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}m ${rem}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const LOG_COLORS: Record<string, string> = {
  info: 'text-slate-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  debug: 'text-slate-600',
};

/* ── Props ──────────────────────────────────────────────── */

interface Props {
  jobId: string;
  onBack: () => void;
}

export default function JobMonitor({ jobId, onBack }: Readonly<Props>) {
  const { data: job, refetch } = useJob(jobId);
  const { data: wsData, connected, logs: wsLogs } = useWebSocket(jobId);

  const progress = wsData?.progress ?? job?.progress ?? 0;
  const message = wsData?.message ?? job?.status_message ?? '';
  const status = wsData?.status ?? job?.status ?? 'pending';

  /* ── Clipboard ────────────────────────────────────────── */
  const [copied, setCopied] = useState(false);
  const copyId = useCallback(() => {
    void navigator.clipboard.writeText(jobId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [jobId]);

  /* ── Duration ticker ──────────────────────────────────── */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (status === 'processing' || status === 'pending') {
      const t = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(t);
    }
  }, [status]);

  const isTerminal = isTerminalStatus(status);
  const durationMs = computeDuration(job, status, now);

  /* ── Logs: fetch historical + merge WS ────────────────── */
  const [historicalLogs, setHistoricalLogs] = useState<JobLogEntry[]>([]);
  const [logFilter, setLogFilter] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .get(`/jobs/${jobId}/logs`, { params: { limit: 500 } })
      .then((r) => setHistoricalLogs(r.data as JobLogEntry[]))
      .catch(() => {});
  }, [jobId]);

  const allLogs = [...historicalLogs, ...wsLogs];
  const filteredLogs = logFilter ? allLogs.filter((l) => l.level === logFilter) : allLogs;

  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [filteredLogs.length, autoScroll]);

  /* ── Actions ──────────────────────────────────────────── */
  const handleDelete = useCallback(() => {
    void api.delete(`/jobs/${jobId}`).then(() => onBack());
  }, [jobId, onBack]);

  const handleCancel = useCallback(() => {
    void api.delete(`/jobs/${jobId}`).then(() => refetch());
  }, [jobId, refetch]);

  const handleRetry = useCallback(() => {
    if (!job) return;
    void api
      .post('/jobs', { job_type: job.job_type, params: job.params, input_path: job.input_path })
      .then(() => onBack());
  }, [job, onBack]);

  /* ── Params display ───────────────────────────────────── */
  const params = job?.params ?? {};
  const paramEntries = Object.entries(params).filter(
    ([k]) => !['image_paths', 'input_path', 'output_path'].includes(k),
  );

  /* ── Timeline steps ───────────────────────────────────── */
  const timelineSteps = buildTimelineSteps(job, status);

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-slate-400 hover:text-white focus-ring rounded-lg px-1"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Jobs
      </button>

      {/* ── Header ─────────────────────────────────────── */}
      <div className="bg-card border border-subtle rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold font-mono break-all">{jobId}</h2>
            <button
              onClick={copyId}
              className="text-slate-400 hover:text-white"
              title="Copy Job ID"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {connected && (
              <span className="flex items-center gap-1 text-xs text-green-400">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                Live
              </span>
            )}
            <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadgeClass(status)}`}>
              {status}
            </span>
            {durationMs > 0 && (
              <span className="text-xs text-slate-400">{formatDuration(durationMs)}</span>
            )}
          </div>
        </div>

        {/* ── Progress ─────────────────────────────────── */}
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-slate-300 truncate">{message}</span>
            <span className="text-slate-400 ml-2">{progress}%</span>
          </div>
          <div className="w-full h-3 bg-space-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${progressBarColor(status)}`}
              style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
            />
          </div>
        </div>

        {/* ── Actions ──────────────────────────────────── */}
        <div className="flex gap-2 flex-wrap">
          {(status === 'processing' || status === 'pending') && (
            <button
              onClick={handleCancel}
              className="flex items-center gap-1 px-3 py-1.5 min-h-11 text-sm bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
            >
              <X className="w-3.5 h-3.5" /> Cancel
            </button>
          )}
          {status === 'failed' && (
            <button
              onClick={handleRetry}
              className="flex items-center gap-1 px-3 py-1.5 min-h-11 text-sm bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded-lg transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Retry
            </button>
          )}
          <button
            onClick={handleDelete}
            className="flex items-center gap-1 px-3 py-1.5 min-h-11 text-sm bg-slate-500/10 text-slate-400 hover:bg-slate-500/20 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      </div>

      {/* ── Parameters ─────────────────────────────────── */}
      {paramEntries.length > 0 && (
        <div className="bg-card border border-subtle rounded-xl p-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Job Parameters</h3>
          <div className="@container grid grid-cols-1 @xs:grid-cols-2 @md:grid-cols-3 gap-3 text-sm">
            {paramEntries.map(([key, val]) => (
              <div key={key} className="bg-space-700/50 border border-subtle rounded-lg px-3 py-2">
                <p className="text-[10px] text-slate-400 uppercase">{key.replace(/_/g, ' ')}</p>
                <p className="font-medium truncate">
                  {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Timeline ───────────────────────────────────── */}
      {timelineSteps.length > 0 && (
        <div className="bg-card border border-subtle rounded-xl p-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Timeline</h3>
          <div className="flex items-center gap-0">
            {timelineSteps.map((step, i) => (
              <div key={step.label} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-3 h-3 rounded-full ${timelineDotColor(step)}`}
                  />
                  <span className="text-[10px] text-slate-400 mt-1">{step.label}</span>
                  {step.time && (
                    <span className="text-[10px] text-slate-500">{fmtTime(step.time)}</span>
                  )}
                </div>
                {i < timelineSteps.length - 1 && (
                  <div
                    className={`w-16 sm:w-24 h-0.5 mx-1 ${timelineSteps[i + 1].done ? 'bg-green-400/50' : 'bg-slate-700'}`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Log Console ────────────────────────────────── */}
      <div className="bg-card border border-subtle rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-300">Logs</h3>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs">
              <Filter className="w-3 h-3 text-slate-500" />
              {['all', 'info', 'warn', 'error', 'debug'].map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setLogFilter(lvl === 'all' ? null : lvl)}
                  className={`px-1.5 py-0.5 rounded text-xs transition-colors ${
                    (lvl === 'all' && !logFilter) || logFilter === lvl
                      ? 'bg-slate-600 text-white'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
            <button
              onClick={() => setAutoScroll((p) => !p)}
              className={`p-1 rounded transition-colors ${
                autoScroll ? 'text-green-400' : 'text-slate-500'
              }`}
              title={autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
            >
              <ArrowDownToLine className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div
          ref={logRef}
          className="bg-slate-950 rounded-lg p-3 font-mono text-xs overflow-y-auto"
          style={{ minHeight: '200px', maxHeight: '400px' }}
        >
          {filteredLogs.length === 0 ? (
            <span className="text-slate-600">No logs yet…</span>
          ) : (
            filteredLogs.map((entry, i) => (
              <div key={i} className={`${LOG_COLORS[entry.level] ?? 'text-slate-400'} leading-5`}>
                <span className="text-slate-600">[{fmtTime(entry.timestamp)}]</span>{' '}
                <span className="text-slate-500 uppercase w-12 inline-block">{entry.level}</span>{' '}
                {entry.message}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Error section ──────────────────────────────── */}
      {status === 'failed' && job?.error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-red-400 mb-2">Error</h3>
          <pre className="text-sm text-red-300 whitespace-pre-wrap font-mono break-all">
            {job.error}
          </pre>
        </div>
      )}

      {/* ── Output ─────────────────────────────────────── */}
      {(status === 'completed' || status === 'completed_partial') && (
        <div className="space-y-4">
          {job?.output_path && <VideoPlayer src={`/api/jobs/${jobId}/output`} />}
          <a
            href={`/api/jobs/${jobId}/download`}
            download
            className="inline-flex items-center gap-2 px-4 py-2 btn-primary-mix text-white rounded-xl text-sm font-medium transition-colors focus-ring btn-interactive"
          >
            <Download className="w-4 h-4" /> Download Output
          </a>  
        </div>
      )}
    </div>
  );
}
