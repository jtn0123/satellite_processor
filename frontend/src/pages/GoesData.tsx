import { lazy, Suspense, useState, useCallback, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Satellite,
  Download,
  Grid3X3,
  Map,
  BarChart3,
} from 'lucide-react';
import { usePageTitle } from '../hooks/usePageTitle';
import { useHotkeys } from '../hooks/useHotkeys';
import { useSwipeTabs } from '../hooks/useSwipeTabs';
import TabErrorBoundary from '../components/GoesData/TabErrorBoundary';
import Skeleton from '../components/GoesData/Skeleton';
import Breadcrumb, { type BreadcrumbSegment } from '../components/GoesData/Breadcrumb';

const FetchTab = lazy(() => import('../components/GoesData/FetchTab'));
const BrowseTab = lazy(() => import('../components/GoesData/BrowseTab'));
const MapTab = lazy(() => import('../components/GoesData/MapTab'));
const StatsTab = lazy(() => import('../components/GoesData/StatsTab'));
const GapsTab = lazy(() => import('../components/GoesData/GapsTab'));

type TabId = 'browse' | 'fetch' | 'map' | 'stats';

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

const tabs: TabDef[] = [
  { id: 'browse', label: 'Browse', icon: <Grid3X3 className="w-4 h-4" /> },
  { id: 'fetch', label: 'Fetch', icon: <Download className="w-4 h-4" /> },
  { id: 'map', label: 'Map', icon: <Map className="w-4 h-4" /> },
  { id: 'stats', label: 'Stats', icon: <BarChart3 className="w-4 h-4" /> },
];

const tabLabels: Record<TabId, string> = Object.fromEntries(tabs.map((t) => [t.id, t.label])) as Record<TabId, string>;
const allTabIds: TabId[] = tabs.map((t) => t.id);

function TabLoadingFallback() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {Array.from({ length: 8 }, (_, i) => `tab-skel-${i}`).map((key) => (
          <Skeleton key={key} variant="card" />
        ))}
      </div>
    </div>
  );
}

/** Combined Stats + Gaps view */
function CombinedStatsTab() {
  return (
    <div className="space-y-8">
      <Suspense fallback={<TabLoadingFallback />}>
        <StatsTab />
      </Suspense>
      <div>
        <h2 className="text-lg font-semibold mb-4">Coverage Gaps</h2>
        <Suspense fallback={<TabLoadingFallback />}>
          <GapsTab />
        </Suspense>
      </div>
    </div>
  );
}

export default function GoesData() {
  usePageTitle('Browse & Fetch');
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as TabId | null;
  const [activeTab, setActiveTab] = useState<TabId>(
    tabFromUrl && allTabIds.includes(tabFromUrl) ? tabFromUrl : 'browse'
  );
  const [subView, setSubView] = useState<string | null>(null);

  // Sync tab from URL on mount and URL changes
  useEffect(() => {
    if (tabFromUrl && allTabIds.includes(tabFromUrl) && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabFromUrl]);

  // Wrap changeTab to also update URL
  const changeTab = useCallback((tab: TabId) => {
    setActiveTab(tab);
    setSearchParams(tab === 'browse' ? {} : { tab }, { replace: true });
  }, [setSearchParams]);

  // Keyboard shortcuts: 1-4 switch tabs
  const shortcuts = useMemo(() => {
    const map: Record<string, () => void> = {};
    allTabIds.forEach((id, i) => {
      const key = String(i + 1);
      map[key] = () => { changeTab(id); setSubView(null); };
    });
    return map;
  }, [changeTab]);

  useHotkeys(shortcuts);

  const handleSwipe = useCallback((tab: TabId) => {
    changeTab(tab);
    setSubView(null);
  }, [changeTab]);

  const swipeRef = useSwipeTabs({
    tabs: allTabIds,
    activeTab,
    onSwipe: handleSwipe,
  });

  // Listen for switch-tab events from child components
  useEffect(() => {
    const handler = (e: Event) => {
      const tabId = (e as CustomEvent).detail as TabId;
      if (allTabIds.includes(tabId)) {
        changeTab(tabId);
        setSubView(null);
      }
    };
    globalThis.addEventListener('switch-tab', handler);
    return () => globalThis.removeEventListener('switch-tab', handler);
  }, [changeTab]);

  // Listen for breadcrumb sub-view changes from child components
  useEffect(() => {
    const handler = (e: Event) => {
      setSubView((e as CustomEvent).detail as string | null);
    };
    globalThis.addEventListener('set-subview', handler);
    return () => globalThis.removeEventListener('set-subview', handler);
  }, []);

  // Build breadcrumb segments
  const breadcrumbSegments = useMemo<BreadcrumbSegment[]>(() => {
    const segments: BreadcrumbSegment[] = [
      { label: 'Browse & Fetch' },
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
    if (activeTab === 'stats') {
      return (
        <TabErrorBoundary tabName="Stats" key="stats">
          <div className="content-fade-in">
            <CombinedStatsTab />
          </div>
        </TabErrorBoundary>
      );
    }

    const tabMap: Record<Exclude<TabId, 'stats'>, { component: React.ReactNode; name: string }> = {
      browse: { component: <BrowseTab />, name: 'Browse' },
      fetch: { component: <FetchTab />, name: 'Fetch' },
      map: { component: <MapTab />, name: 'Map' },
    };

    const tab = tabMap[activeTab as Exclude<TabId, 'stats'>];
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
          <h1 className="text-2xl font-bold">Browse & Fetch</h1>
          <Breadcrumb segments={breadcrumbSegments} />
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-50 dark:bg-slate-900 rounded-xl p-1.5 border border-gray-200 dark:border-slate-800 overflow-x-auto scrollbar-hide items-center -mx-4 px-4 md:mx-0 md:px-1.5" role="tablist" aria-label="GOES Data tabs">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            onClick={() => { changeTab(tab.id); setSubView(null); }}
            role="tab"
            aria-label={`${tab.label} tab`}
            aria-selected={activeTab === tab.id}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap min-h-[44px] ${
              activeTab === tab.id
                ? 'bg-primary text-gray-900 dark:text-white shadow-lg shadow-primary/20 glow-primary'
                : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-slate-800'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div ref={swipeRef} key={activeTab} className="animate-fade-in touch-pan-y">
        {renderTab()}
      </div>
    </div>
  );
}
