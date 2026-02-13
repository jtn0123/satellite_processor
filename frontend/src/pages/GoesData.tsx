import { lazy, Suspense, useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import Breadcrumb, { type BreadcrumbSegment } from '../components/GoesData/Breadcrumb';
import api from '../api/client';

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

const tabLabels: Record<TabId, string> = {
  fetch: 'Fetch',
  browse: 'Browse',
  collections: 'Collections',
  animation: 'Animation',
  presets: 'Presets',
  stats: 'Stats',
  cleanup: 'Cleanup',
  live: 'Live',
  map: 'Map',
  composites: 'Composites',
};

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

function WelcomeCard({ onFetchClick }: { onFetchClick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8">
      <div className="bg-gray-100/50 dark:bg-slate-800/50 rounded-full p-6 mb-6">
        <Satellite className="w-16 h-16 text-primary" />
      </div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Welcome to GOES Data Manager</h2>
      <p className="text-gray-500 dark:text-slate-400 text-center max-w-md mb-8">
        Start by fetching your first satellite frames. You can download GOES-16 and GOES-18
        imagery across multiple bands and sectors.
      </p>
      <button
        onClick={onFetchClick}
        className="flex items-center gap-2 px-6 py-3 bg-primary text-gray-900 dark:text-white rounded-xl hover:bg-primary/90 transition-colors font-medium text-lg shadow-lg shadow-primary/20 btn-interactive"
      >
        <Download className="w-5 h-5" />
        Fetch Data
      </button>
      <div className="flex gap-6 mt-8 text-sm text-gray-400 dark:text-slate-500">
        <span>16 spectral bands</span>
        <span>·</span>
        <span>Multiple sectors</span>
        <span>·</span>
        <span>Animation studio</span>
      </div>
    </div>
  );
}

export default function GoesData() {
  usePageTitle('GOES Data');
  const [activeTab, setActiveTab] = useState<TabId>('browse');
  const [subView, setSubView] = useState<string | null>(null);

  // Check if any frames exist for smart landing
  const { data: frameCheck, isLoading: frameCheckLoading } = useQuery<{ items: unknown[]; total: number }>({
    queryKey: ['goes-frames-check'],
    queryFn: () => api.get('/goes/frames', { params: { limit: 1 } }).then((r) => r.data),
    staleTime: 60_000,
  });

  const hasFrames = frameCheck ? frameCheck.total > 0 : null;
  const showWelcome = !frameCheckLoading && hasFrames === false && activeTab === 'browse';

  // Keyboard shortcuts: 1-0 switch tabs
  const shortcuts = useMemo(() => {
    const map: Record<string, () => void> = {};
    allTabIds.forEach((id, i) => {
      const key = i < 9 ? String(i + 1) : '0';
      map[key] = () => { setActiveTab(id); setSubView(null); };
    });
    return map;
  }, []);

  useHotkeys(shortcuts);

  // Listen for switch-tab events from child components
  useEffect(() => {
    const handler = (e: Event) => {
      const tabId = (e as CustomEvent).detail as TabId;
      if (allTabIds.includes(tabId)) {
        setActiveTab(tabId);
        setSubView(null);
      }
    };
    window.addEventListener('switch-tab', handler);
    return () => window.removeEventListener('switch-tab', handler);
  }, []);

  // Listen for breadcrumb sub-view changes from child components
  useEffect(() => {
    const handler = (e: Event) => {
      setSubView((e as CustomEvent).detail as string | null);
    };
    window.addEventListener('set-subview', handler);
    return () => window.removeEventListener('set-subview', handler);
  }, []);

  // Build breadcrumb segments
  const breadcrumbSegments = useMemo<BreadcrumbSegment[]>(() => {
    const segments: BreadcrumbSegment[] = [
      { label: 'GOES Data' },
      {
        label: tabLabels[activeTab],
        onClick: subView ? () => setSubView(null) : undefined,
      },
    ];
    if (subView) {
      segments.push({ label: subView });
    }
    return segments;
  }, [activeTab, subView]);

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
          <div className="content-fade-in">
            {tab.component}
          </div>
        </Suspense>
      </TabErrorBoundary>
    );
  }, [activeTab]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Satellite className="w-7 h-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">GOES Data</h1>
          <Breadcrumb segments={breadcrumbSegments} />
        </div>
      </div>

      {/* Tab bar - grouped with dividers */}
      <div className="flex gap-1 bg-gray-50 dark:bg-slate-900 rounded-xl p-1.5 border border-gray-200 dark:border-slate-800 overflow-x-auto scrollbar-hide items-center -mx-4 px-4 md:mx-0 md:px-1.5" role="tablist" aria-label="GOES Data tabs">
        {tabGroups.map((group, gi) => (
          <div key={group.label} className="flex items-center gap-1">
            {gi > 0 && <div className="w-px h-6 bg-gray-200 dark:bg-slate-700 mx-1 shrink-0" />}
            <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-slate-600 px-1 shrink-0">{group.label}</span>
            {group.tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setSubView(null); }}
                role="tab"
                aria-label={`${tab.label} tab`}
                aria-selected={activeTab === tab.id}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap min-h-[44px] ${
                  activeTab === tab.id
                    ? 'bg-primary text-gray-900 dark:text-white shadow-lg shadow-primary/20'
                    : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-100 dark:bg-slate-800'
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
      <div key={activeTab} className="animate-fade-in">
        {showWelcome ? (
          <WelcomeCard onFetchClick={() => setActiveTab('fetch')} />
        ) : (
          renderTab()
        )}
      </div>
    </div>
  );
}
