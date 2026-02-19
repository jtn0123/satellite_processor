import { useEffect, useState, useRef, useCallback } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Cog,
  ListTodo,
  Cpu,
  Satellite,
  Radio,
  Sparkles,
  FileText,
  Menu,
  X,
  Sun,
  Moon,
  HelpCircle,
} from 'lucide-react';
import ErrorBoundary from './ErrorBoundary';
import KeyboardShortcuts from './KeyboardShortcuts';
import ConnectionStatus from './ConnectionStatus';
import NotificationBell from './NotificationBell';
import WhatsNewModal from './WhatsNewModal';
import MobileBottomNav from './MobileBottomNav';
import { useJobToasts } from '../hooks/useJobToasts';

const links = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/live', icon: Radio, label: 'Live View' },
  { to: '/goes', icon: Satellite, label: 'Browse & Fetch' },
  { to: '/animate', icon: Sparkles, label: 'Animate' },
  { to: '/jobs', icon: ListTodo, label: 'Jobs' },
  { to: '/settings', icon: Cog, label: 'Settings' },
];

export default function Layout() {
  const [versionInfo, setVersionInfo] = useState({ version: '', commit: '', display: '' });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [hasNewVersion, setHasNewVersion] = useState(false);
  const drawerRef = useRef<HTMLDialogElement>(null);

  // #8: System theme detection - check preference on first load
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof globalThis === 'undefined') return 'dark';
    let stored: string | null = null;
    try { stored = localStorage.getItem('theme'); } catch { /* private browsing */ }
    if (stored === 'dark' || stored === 'light') return stored;
    // No manual preference - detect system
    const prefersDark = globalThis.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
    try { localStorage.setItem('theme', theme); } catch { /* private browsing */ }
    document.documentElement.style.transition = 'background-color 200ms, color 200ms';
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('theme-manual', 'true'); } catch { /* private browsing */ }
      return next;
    });
  }, []);

  useJobToasts();

  useEffect(() => {
    import('../api/client').then(({ default: apiClient }) =>
    apiClient.get('/health/version')
      .then((r) => r.data)
      .then((d: Record<string, string>) => {
        const version = d.version ?? '';
        const commit = d.commit ?? d.build ?? 'dev';
        const sha = commit && commit !== 'dev' ? ` (${commit.slice(0, 7)})` : '';
        setVersionInfo({ version, commit, display: `v${version}${sha}` });
        // Auto-open on new version
        let lastSeen: string | null = null;
        try { lastSeen = localStorage.getItem('whatsNewLastSeen'); } catch { /* private browsing */ }
        const toMajorMinor = (v: string) => v.split('.').slice(0, 2).join('.');
        if (version && toMajorMinor(version) !== toMajorMinor(lastSeen ?? '')) {
          setHasNewVersion(true);
          setShowWhatsNew(true);
        }
      })
      .catch(() => {}));
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
      {/* Skip to content link for accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-200 focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-primary focus:text-gray-900 dark:text-white focus:rounded-lg focus:outline-hidden"
      >
        Skip to content
      </a>
      <KeyboardShortcuts />

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-white dark:bg-space-900 border-r border-gray-200 dark:border-space-700/50">
        <div className="flex items-center gap-2 px-6 py-5 border-b border-gray-200 dark:border-space-700/50">
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
                    : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-space-800 border border-transparent'
                }`
              }
              aria-label={l.label}
            >
              <l.icon className="w-5 h-5" />
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 pb-2 space-y-1">
          <a
            href="/docs"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="API Documentation (opens in new tab)"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-space-800 transition-colors focus-ring"
          >
            <FileText className="w-5 h-5" />
            API Docs
          </a>
          {/* #9: Keyboard shortcut button */}
          <button
            onClick={() => globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }))}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-space-800 transition-colors focus-ring w-full"
            aria-label="Keyboard shortcuts"
          >
            <HelpCircle className="w-5 h-5" />
            Shortcuts
          </button>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 dark:border-space-700/50 space-y-2">
          <div className="flex items-center justify-between">
            <ConnectionStatus />
            <div className="flex items-center gap-1">
              <NotificationBell />
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-space-800 text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition-colors focus-ring"
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
                title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
          </div>
          {/* #15: Clickable version footer */}
          <div className="text-sm text-gray-500 dark:text-slate-400 flex items-center gap-2">
            <Cpu className="w-4 h-4" />
            <button
              onClick={() => setShowWhatsNew(true)}
              className="hover:text-gray-600 dark:hover:text-slate-300 dark:text-slate-300 transition-colors text-left relative"
              aria-label="Show changelog"
            >
              Satellite Processor {versionInfo.display}
              {hasNewVersion && (
                <span className="absolute -top-1 -right-3 w-2.5 h-2.5 bg-primary rounded-full animate-pulse" aria-label="New version available" />
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <button
          type="button"
          className="fixed inset-0 bg-black/30 dark:bg-black/60 z-40 md:hidden border-none cursor-default sidebar-enter"
          onClick={handleOverlayClick}
          aria-label="Close menu"
        />
      )}

      {/* Mobile slide-out drawer */}
      {drawerOpen && (
        <dialog
          ref={drawerRef}
          open
          aria-label="Navigation menu"
          aria-modal="true"
          className="fixed inset-y-0 left-0 w-72 bg-white dark:bg-space-900 border-r border-gray-200 dark:border-space-700/50 z-50 transform translate-x-0 transition-transform duration-200 ease-out md:hidden p-0 m-0 max-h-none h-full"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-space-700/50">
            <div className="flex items-center gap-2">
              <Satellite className="w-5 h-5 text-primary" />
              <span className="font-bold">SatTracker</span>
            </div>
            <button
              onClick={() => setDrawerOpen(false)}
              className="p-1.5 min-h-11 min-w-11 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-space-800 text-gray-500 dark:text-slate-400 focus-ring active:scale-95 transition-transform"
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
                  `flex items-center gap-3 px-3 py-3 min-h-11 rounded-lg text-sm font-medium transition-colors active:scale-[0.97] active:bg-primary/5 ${
                    isActive
                      ? 'bg-primary/10 text-primary border-l-2 border-primary'
                      : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-space-800 border-l-2 border-transparent'
                  }`
                }
                aria-label={l.label}
              >
                <l.icon className="w-5 h-5" />
                {l.label}
              </NavLink>
            ))}
          </nav>
        </dialog>
      )}

      {/* Main content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white dark:bg-space-900 border-b border-gray-200 dark:border-space-700/50">
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-2 min-h-11 min-w-11 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-space-800 text-gray-500 dark:text-slate-400 focus-ring active:scale-95 transition-transform"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Satellite className="w-5 h-5 text-primary" />
            <span className="font-bold">SatTracker</span>
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-space-800 text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition-colors focus-ring"
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        <main id="main-content" className="flex-1 overflow-y-auto p-4 md:p-8 pb-20 md:pb-8">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
          <footer className="md:hidden mt-8 pb-4 text-center text-sm text-gray-500 dark:text-slate-400">
            <button
              onClick={() => setShowWhatsNew(true)}
              className="hover:text-gray-600 dark:hover:text-slate-300 dark:text-slate-300 transition-colors relative"
              aria-label="Show changelog"
            >
              {versionInfo.display}
              {hasNewVersion && (
                <span className="absolute -top-1 -right-3 w-2.5 h-2.5 bg-primary rounded-full animate-pulse" aria-label="New version available" />
              )}
            </button>
          </footer>
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <MobileBottomNav />

      {/* What's New Modal */}
      {showWhatsNew && (
        <WhatsNewModal
          version={versionInfo.version}
          commit={versionInfo.commit}
          onClose={() => {
            setShowWhatsNew(false);
            setHasNewVersion(false);
            if (versionInfo.version) {
              try { localStorage.setItem('whatsNewLastSeen', versionInfo.version); } catch { /* private browsing */ }
            }
          }}
        />
      )}
    </div>
  );
}
