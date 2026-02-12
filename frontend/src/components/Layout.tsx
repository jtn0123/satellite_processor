import { useEffect, useState, useRef, useCallback } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Upload,
  Cog,
  ListTodo,
  Cpu,
  Satellite,
  FlaskConical,
  FileText,
  Menu,
  X,
  BookOpen,
} from 'lucide-react';
import ErrorBoundary from './ErrorBoundary';
import KeyboardShortcuts from './KeyboardShortcuts';
import ConnectionStatus from './ConnectionStatus';
import { useJobToasts } from '../hooks/useJobToasts';

const links = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/upload', icon: Upload, label: 'Upload' },
  { to: '/process', icon: FlaskConical, label: 'Process' },
  { to: '/jobs', icon: ListTodo, label: 'Jobs' },
  { to: '/goes', icon: Satellite, label: 'GOES Data' },
  { to: '/presets', icon: BookOpen, label: 'Presets' },
  { to: '/settings', icon: Cog, label: 'Settings' },
];

export default function Layout() {
  const [versionInfo, setVersionInfo] = useState('v2.1.0');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  useJobToasts();

  useEffect(() => {
    fetch('/api/health/version')
      .then((r) => r.json())
      .then((d) => {
        const sha = d.build && d.build !== 'dev' ? ` (${d.build.slice(0, 7)})` : '';
        setVersionInfo(`v${d.version}${sha}`);
      })
      .catch(() => {});
  }, []);

  // Close drawer on navigation
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // Close drawer on outside click
  const handleOverlayClick = useCallback(() => setDrawerOpen(false), []);

  // Close drawer on Escape + trap focus (#211)
  useEffect(() => {
    if (!drawerOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setDrawerOpen(false); return; }
      if (e.key === 'Tab' && drawerRef.current) {
        const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
          'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handler);
    // Focus first element in drawer
    setTimeout(() => drawerRef.current?.querySelector<HTMLElement>('a, button')?.focus(), 0);
    return () => document.removeEventListener('keydown', handler);
  }, [drawerOpen]);

  return (
    <div className="flex h-screen overflow-hidden">
      <KeyboardShortcuts />

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-space-900 border-r border-subtle">
        <div className="flex items-center gap-2 px-6 py-5 border-b border-subtle">
          <Satellite className="w-6 h-6 text-primary" />
          <span className="text-lg font-bold tracking-tight">SatTracker</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors focus-ring ${
                  isActive
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'text-slate-400 hover:text-white hover:bg-space-800 border border-transparent'
                }`
              }
            >
              <l.icon className="w-5 h-5" />
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 pb-2">
          <a
            href="/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-space-800 transition-colors focus-ring"
          >
            <FileText className="w-5 h-5" />
            API Docs
          </a>
        </div>
        <div className="px-6 py-4 border-t border-subtle space-y-2">
          <ConnectionStatus />
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <Cpu className="w-4 h-4" />
            Satellite Processor {versionInfo}
          </div>
        </div>
      </aside>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div
          role="button"
          tabIndex={0}
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={handleOverlayClick}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') handleOverlayClick(); }}
          aria-label="Close menu"
        />
      )}

      {/* Mobile slide-out drawer */}
      <div
        ref={drawerRef}
        className={`fixed inset-y-0 left-0 w-72 bg-space-900 border-r border-subtle z-50 transform transition-transform duration-200 ease-out md:hidden ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-subtle">
          <div className="flex items-center gap-2">
            <Satellite className="w-5 h-5 text-primary" />
            <span className="font-bold">SatTracker</span>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            className="p-1.5 rounded-lg hover:bg-space-800 text-slate-400 focus-ring"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="px-3 py-4 space-y-1">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              onClick={closeDrawer}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-slate-400 hover:text-white hover:bg-space-800'
                }`
              }
            >
              <l.icon className="w-5 h-5" />
              {l.label}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Main content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-space-900 border-b border-subtle">
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-2 rounded-lg hover:bg-space-800 text-slate-400 focus-ring"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Satellite className="w-5 h-5 text-primary" />
            <span className="font-bold">SatTracker</span>
          </div>
          <div className="w-9" /> {/* Spacer for centering */}
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
