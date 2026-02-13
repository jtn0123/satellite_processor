import { useState } from 'react';
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
import FetchTab from '../components/GoesData/FetchTab';
import BrowseTab from '../components/GoesData/BrowseTab';
import CollectionsTab from '../components/GoesData/CollectionsTab';
import AnimationStudioTab from '../components/GoesData/AnimationStudioTab';
import StatsTab from '../components/GoesData/StatsTab';
import PresetsTab from '../components/GoesData/PresetsTab';
import CleanupTab from '../components/GoesData/CleanupTab';
import LiveTab from '../components/GoesData/LiveTab';
import MapTab from '../components/GoesData/MapTab';
import CompositesTab from '../components/GoesData/CompositesTab';

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

export default function GoesData() {
  usePageTitle('GOES Data');
  const [activeTab, setActiveTab] = useState<TabId>('browse');

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
        {activeTab === 'fetch' && <FetchTab />}
        {activeTab === 'browse' && <BrowseTab />}
        {activeTab === 'collections' && <CollectionsTab />}
        {activeTab === 'animation' && <AnimationStudioTab />}
        {activeTab === 'presets' && <PresetsTab />}
        {activeTab === 'stats' && <StatsTab />}
        {activeTab === 'cleanup' && <CleanupTab />}
        {activeTab === 'live' && <LiveTab />}
        {activeTab === 'map' && <MapTab />}
        {activeTab === 'composites' && <CompositesTab />}
      </div>
    </div>
  );
}
