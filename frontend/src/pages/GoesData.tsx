import { lazy, Suspense, useState, useCallback, useMemo, useEffect } from 'react';
import {
  Satellite,
  Download,
  Grid3X3,
  Trash2,
  BarChart3,
  Library,
  Film,
  Save,
  Radio,
  Map,
  Layers,
} from 'lucide-react';
import { usePageTitle } from '../hooks/usePageTitle';
import { useHotkeys } from '../hooks/useHotkeys';
import TabErrorBoundary from '../components/GoesData/TabErrorBoundary';
import Skeleton from '../components/GoesData/Skeleton';

const FetchTab = lazy(() => import('../components/GoesData/FetchTab'));
const BrowseTab = lazy(() => import('../components/GoesData/BrowseTab'));
const CollectionsTab = lazy(() => import('../components/GoesData/CollectionsTab'));
const AnimationStudioTab = lazy(() => import('../components/GoesData/AnimationStudioTab'));
const StatsTab = lazy(() => import('../components/GoesData/StatsTab'));
const PresetsTab = lazy(() => import('../components/GoesData/PresetsTab'));
const CleanupTab = lazy(() => import('../components/GoesData/CleanupTab'));
const LiveTab = lazy(() => import('../components/GoesData/LiveTab'));
const MapTab = lazy(() => import('../components/GoesData/MapTab'));
const CompositesTab = lazy(() => import('../components/GoesData/CompositesTab'));

type TabId = 'fetch' | 'browse' | 'collections' | 'stats' | 'animation' | 'presets' | 'cleanup' | 'live' | 'map' | 'composites';

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

interface TabGroup {
  label: string;
  tabs: TabDef[];
}

const tabGroups: TabGroup[] = [
  {
    label: 'Data',
    tabs: [
      { id: 'browse', label: 'Browse', icon: <Grid3X3 className="w-4 h-4" /> },
      { id: 'live', label: 'Live', icon: <Radio className="w-4 h-4" /> },
      { id: 'map', label: 'Map', icon: <Map className="w-4 h-4" /> },
      { id: 'fetch', label: 'Fetch', icon: <Download className="w-4 h-4" /> },
    ],
  },
  {
    label: 'Tools',
    tabs: [
      { id: 'composites', label: 'Composites', icon: <Layers className="w-4 h-4" /> },
      { id: 'animation', label: 'Animation', icon: <Film className="w-4 h-4" /> },
    ],
  },
  {
    label: 'Manage',
    tabs: [
      { id: 'collections', label: 'Collections', icon: <Library className="w-4 h-4" /> },
      { id: 'presets', label: 'Presets', icon: <Save className="w-4 h-4" /> },
      { id: 'stats', label: 'Stats', icon: <BarChart3 className="w-4 h-4" /> },
      { id: 'cleanup', label: 'Cleanup', icon: <Trash2 className="w-4 h-4" /> },
    ],
  },
];

// Flat list of all tab IDs in order for keyboard shortcut mapping
const allTabIds: TabId[] = tabGroups.flatMap((g) => g.tabs.map((t) => t.id));

function TabLoadingFallback() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={`tab-skel-${i}`} variant="card" />
        ))}
      </div>
    </div>
  );
}

export default function GoesData() {
  usePageTitle('GOES Data');
  const [activeTab, setActiveTab] = useState<TabId>('browse');

  // Keyboard shortcuts: 1-0 switch tabs
  const shortcuts = useMemo(() => {
    const map: Record<string, () => void> = {};
    allTabIds.forEach((id, i) => {
      const key = i < 9 ? String(i + 1) : '0';
      map[key] = () => setActiveTab(id);
    });
    return map;
  }, []);

  useHotkeys(shortcuts);

  // Listen for switch-tab events from child components (e.g., empty state CTA)
  useEffect(() => {
    const handler = (e: Event) => {
      const tabId = (e as CustomEvent).detail as TabId;
      if (allTabIds.includes(tabId)) {
        setActiveTab(tabId);
      }
    };
    window.addEventListener('switch-tab', handler);
    return () => window.removeEventListener('switch-tab', handler);
  }, []);

  const renderTab = useCallback(() => {
    const tabMap: Record<TabId, { component: React.ReactNode; name: string }> = {
      fetch: { component: <FetchTab />, name: 'Fetch' },
      browse: { component: <BrowseTab />, name: 'Browse' },
      collections: { component: <CollectionsTab />, name: 'Collections' },
      animation: { component: <AnimationStudioTab />, name: 'Animation Studio' },
      presets: { component: <PresetsTab />, name: 'Presets' },
      stats: { component: <StatsTab />, name: 'Stats' },
      cleanup: { component: <CleanupTab />, name: 'Cleanup' },
      live: { component: <LiveTab />, name: 'Live' },
      map: { component: <MapTab />, name: 'Map' },
      composites: { component: <CompositesTab />, name: 'Composites' },
    };

    const tab = tabMap[activeTab];
    return (
      <TabErrorBoundary tabName={tab.name} key={activeTab}>
        <Suspense fallback={<TabLoadingFallback />}>
          {tab.component}
        </Suspense>
      </TabErrorBoundary>
    );
  }, [activeTab]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Satellite className="w-7 h-7 text-primary" />
        <h1 className="text-2xl font-bold">GOES Data</h1>
      </div>

      {/* Tab bar - grouped with dividers */}
      <div className="flex gap-1 bg-slate-900 rounded-xl p-1.5 border border-slate-800 overflow-x-auto scrollbar-hide items-center">
        {tabGroups.map((group, gi) => (
          <div key={group.label} className="flex items-center gap-1">
            {gi > 0 && <div className="w-px h-6 bg-slate-700 mx-1 flex-shrink-0" />}
            <span className="text-[10px] uppercase tracking-wider text-slate-600 px-1 flex-shrink-0">{group.label}</span>
            {group.tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-primary text-white shadow-lg shadow-primary/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Tab content */}
      <div className="animate-fade-in">
        {renderTab()}
      </div>
    </div>
  );
}
