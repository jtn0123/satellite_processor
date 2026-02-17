import { lazy, Suspense, useState, useCallback, useMemo, useEffect } from 'react';
import {
  Satellite,
  Download,
  Grid3X3,
  Radio,
  Map,
  GalleryHorizontalEnd,
  Sparkles,
  LayoutDashboard,
} from 'lucide-react';
import { usePageTitle } from '../hooks/usePageTitle';
import { useHotkeys } from '../hooks/useHotkeys';
import { useSwipeTabs } from '../hooks/useSwipeTabs';
import TabErrorBoundary from '../components/GoesData/TabErrorBoundary';
import Skeleton from '../components/GoesData/Skeleton';
import Breadcrumb, { type BreadcrumbSegment } from '../components/GoesData/Breadcrumb';

const OverviewTab = lazy(() => import('../components/GoesData/OverviewTab'));
const FetchTab = lazy(() => import('../components/GoesData/FetchTab'));
const BrowseTab = lazy(() => import('../components/GoesData/BrowseTab'));
const AnimateTab = lazy(() => import('../components/Animation/AnimateTab'));
const LiveTab = lazy(() => import('../components/GoesData/LiveTab'));
const MapTab = lazy(() => import('../components/GoesData/MapTab'));
const FrameGallery = lazy(() => import('../components/GoesData/FrameGallery'));

type TabId = 'overview' | 'browse' | 'gallery' | 'live' | 'fetch' | 'animate' | 'map';

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

const tabs: TabDef[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: 'browse', label: 'Browse', icon: <Grid3X3 className="w-4 h-4" /> },
  { id: 'gallery', label: 'Gallery', icon: <GalleryHorizontalEnd className="w-4 h-4" /> },
  { id: 'live', label: 'Live', icon: <Radio className="w-4 h-4" /> },
  { id: 'fetch', label: 'Fetch', icon: <Download className="w-4 h-4" /> },
  { id: 'animate', label: 'Animate', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'map', label: 'Map', icon: <Map className="w-4 h-4" /> },
];

const tabLabels: Record<TabId, string> = Object.fromEntries(tabs.map((t) => [t.id, t.label])) as Record<TabId, string>;
const allTabIds: TabId[] = tabs.map((t) => t.id);

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
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [subView, setSubView] = useState<string | null>(null);

  // Keyboard shortcuts: 1-7 switch tabs
  const shortcuts = useMemo(() => {
    const map: Record<string, () => void> = {};
    allTabIds.forEach((id, i) => {
      const key = String(i + 1);
      map[key] = () => { setActiveTab(id); setSubView(null); };
    });
    return map;
  }, []);

  useHotkeys(shortcuts);

  const handleSwipe = useCallback((tab: TabId) => {
    setActiveTab(tab);
    setSubView(null);
  }, []);

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
        setActiveTab(tabId);
        setSubView(null);
      }
    };
    globalThis.addEventListener('switch-tab', handler);
    return () => globalThis.removeEventListener('switch-tab', handler);
  }, []);

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
      overview: { component: <OverviewTab />, name: 'Overview' },
      browse: { component: <BrowseTab />, name: 'Browse' },
      gallery: { component: <FrameGallery />, name: 'Gallery' },
      live: { component: <LiveTab />, name: 'Live' },
      fetch: { component: <FetchTab />, name: 'Fetch' },
      animate: { component: <AnimateTab />, name: 'Animate' },
      map: { component: <MapTab />, name: 'Map' },
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

      {/* Tab bar — flat, no groups */}
      <div className="flex gap-1 bg-gray-50 dark:bg-slate-900 rounded-xl p-1.5 border border-gray-200 dark:border-slate-800 overflow-x-auto scrollbar-hide items-center -mx-4 px-4 md:mx-0 md:px-1.5" role="tablist" aria-label="GOES Data tabs">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setSubView(null); }}
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

      {/* Tab content — swipeable on mobile */}
      <div ref={swipeRef} key={activeTab} className="animate-fade-in touch-pan-y">
        {renderTab()}
      </div>
    </div>
  );
}
