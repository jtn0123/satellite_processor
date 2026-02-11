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
} from 'lucide-react';
import ErrorBoundary from './ErrorBoundary';

const links = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/upload', icon: Upload, label: 'Upload' },
  { to: '/process', icon: FlaskConical, label: 'Process' },
  { to: '/jobs', icon: ListTodo, label: 'Jobs' },
  { to: '/goes', icon: Satellite, label: 'GOES Data' },
  { to: '/settings', icon: Cog, label: 'Settings' },
];

export default function Layout() {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-slate-950 border-r border-slate-800">
        <div className="flex items-center gap-2 px-6 py-5 border-b border-slate-800">
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
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
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
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <FileText className="w-5 h-5" />
            API Docs
          </a>
        </div>
        <div className="px-6 py-4 border-t border-slate-800 text-xs text-slate-500 flex items-center gap-2">
          <Cpu className="w-4 h-4" />
          Satellite Processor v2.0
        </div>
      </aside>

      {/* Mobile header */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Satellite className="w-5 h-5 text-primary" />
            <span className="font-bold">SatTracker</span>
          </div>
          <nav className="flex gap-1">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === '/'}
                aria-label={l.label}
                title={l.label}
                className={({ isActive }) =>
                  `p-2 rounded-lg ${isActive ? 'text-primary bg-primary/10' : 'text-slate-400'}`
                }
              >
                <l.icon className="w-5 h-5" />
              </NavLink>
            ))}
          </nav>
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
