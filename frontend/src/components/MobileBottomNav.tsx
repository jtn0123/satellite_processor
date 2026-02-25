import { useState, useEffect, useCallback } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Radio,
  Grid3X3,
  Sparkles,
  MoreHorizontal,
  ListTodo,
  Cog,
  LayoutDashboard,
  X,
} from 'lucide-react';

const primaryTabs = [
  { to: '/live', label: 'Live', icon: Radio },
  { to: '/goes', label: 'Browse', icon: Grid3X3 },
  { to: '/jobs', label: 'Jobs', icon: ListTodo },
  { to: '/animate', label: 'Animate', icon: Sparkles },
];

const moreLinks = [
  { to: '/settings', label: 'Settings', icon: Cog },
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
];

const moreRoutes = new Set(['/', '/settings', '/upload', '/process', '/presets']);

export default function MobileBottomNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const isMoreActive = moreRoutes.has(location.pathname);

  const isTabActive = (tab: typeof primaryTabs[number]) => {
    const path = location.pathname;

    // Live tab: active on /live
    if (tab.to === '/live') return path === '/live';
    // Animate tab: active on /animate
    if (tab.to === '/animate') return path === '/animate';
    // Browse tab: active on /goes (all sub-tabs)
    if (tab.to === '/goes') return path === '/goes';
    // Jobs tab: active on /jobs
    if (tab.to === '/jobs') return path === '/jobs';
    return false;
  };

  const toggleMore = useCallback(() => setMoreOpen((o) => !o), []);

  // Close more menu on route change and Escape key
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    if (moreOpen) {
      document.addEventListener('keydown', handleKeydown);
      return () => document.removeEventListener('keydown', handleKeydown);
    }
  }, [moreOpen]);

  // Close more menu on navigation — handled by NavLink onClick handlers below

  const isLive = location.pathname === '/live';

  return (
    <>
      {/* More sheet overlay */}
      {moreOpen && (
        <button
          type="button"
          className="fixed inset-0 bg-black/30 dark:bg-black/60 z-40 border-none cursor-default"
          onClick={() => setMoreOpen(false)}
          aria-label="Close more menu"
        />
      )}

      {/* More sheet */}
      {moreOpen && (
        <dialog
          open
          aria-label="More navigation options"
          className="fixed bottom-[64px] left-0 right-0 z-50 bg-white dark:bg-space-900 border-t border-gray-200 dark:border-space-700/50 rounded-t-2xl shadow-xl p-4 animate-slide-up m-0 w-full max-w-full border-none"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-gray-500 dark:text-slate-400">More</span>
            <button
              onClick={() => setMoreOpen(false)}
              className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-space-800 text-gray-500 dark:text-slate-400 focus-ring"
              aria-label="Close more menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <nav className="space-y-1">
            {moreLinks.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === '/'}
                onClick={() => setMoreOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-3 min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-space-800'
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

      {/* Bottom tab bar */}
      <nav
        data-testid="mobile-bottom-nav"
        aria-label="Mobile navigation"
        className={`md:hidden fixed bottom-0 left-0 right-0 z-30 safe-bottom ${isLive ? 'bg-black/60 backdrop-blur-md border-t border-white/10' : 'bg-white dark:bg-space-900 border-t border-gray-200 dark:border-space-700/50'}`}
      >
        <div
          role="tablist"
          aria-label="Navigation tabs"
          className="flex items-center justify-around"
          onKeyDown={(e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button[role="tab"]'));
            const idx = buttons.indexOf(e.target as HTMLElement);
            if (idx < 0) return;
            const next = e.key === 'ArrowRight' ? (idx + 1) % buttons.length : (idx - 1 + buttons.length) % buttons.length;
            buttons[next].focus();
            e.preventDefault();
          }}
        >
        {primaryTabs.map((tab) => {
          const active = isTabActive(tab);
          return (
            <button
              key={tab.label}
              type="button"
              role="tab"
              aria-label={tab.label}
              aria-selected={active}
              onClick={() => {
                setMoreOpen(false);
                navigate(tab.to);
              }}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[48px] min-w-[64px] px-2 py-1.5 text-xs font-medium transition-colors border-none bg-transparent ${
                active
                  ? 'text-primary'
                  : 'text-gray-500 dark:text-slate-400'
              }`}
            >
              <tab.icon className="w-5 h-5" />
              {tab.label}
            </button>
          );
        })}
        <button
          type="button"
          role="tab"
          aria-label="More"
          aria-selected={isMoreActive && !primaryTabs.some((t) => isTabActive(t))}
          onClick={toggleMore}
          className={`flex flex-col items-center justify-center gap-0.5 min-h-[48px] min-w-[64px] px-2 py-1.5 text-xs font-medium transition-colors ${
            isMoreActive && !primaryTabs.some((t) => isTabActive(t))
              ? 'text-primary'
              : 'text-gray-500 dark:text-slate-400'
          }`}
        >
          <MoreHorizontal className="w-5 h-5" />
          More
        </button>
        </div>
      </nav>
    </>
  );
}
