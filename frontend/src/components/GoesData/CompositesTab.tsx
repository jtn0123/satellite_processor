import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Layers, CheckCircle, AlertTriangle, Download } from 'lucide-react';
import api from '../../api/client';
import { showToast } from '../../utils/toast';
import { extractArray } from '../../utils/safeData';

interface Product {
  satellites: string[];
  sectors: { id: string; name: string; product: string }[];
  bands: { id: string; description: string }[];
}

interface CompositeRecipe {
  id: string;
  name: string;
  bands: string[];
}

interface CompositeItem {
  id: string;
  name: string;
  recipe: string;
  satellite: string;
  sector: string;
  capture_time: string;
  file_path: string | null;
  file_size: number;
  status: string;
  error: string;
  created_at: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

const RECIPE_DESCRIPTIONS: Record<string, string> = {
  true_color: 'Natural-looking color using visible bands (C02 + C03 + C01)',
  natural_color: 'Enhanced natural color with near-IR vegetation (C07 + C06 + C02)',
  fire_detection: 'Highlights active fires using shortwave IR (C07 + C06 + C02)',
  dust_ash: 'Detects dust and volcanic ash using IR differences',
  day_cloud_phase: 'Shows cloud phase (ice vs water) using IR and visible',
  airmass: 'Shows air mass boundaries using water vapor channels',
};

export default function CompositesTab() {
  const queryClient = useQueryClient();
  const [selectedRecipe, setSelectedRecipe] = useState('');
  const [satellite, setSatellite] = useState('GOES-16');
  const [sector, setSector] = useState('CONUS');
  const [captureTime, setCaptureTime] = useState('');

  const { data: products } = useQuery<Product>({
    queryKey: ['goes-products'],
    queryFn: () => api.get('/goes/products').then((r) => r.data),
  });

  const { data: recipes } = useQuery<CompositeRecipe[]>({
    queryKey: ['composite-recipes'],
    queryFn: () => api.get('/goes/composite-recipes').then((r) => {
      return extractArray(r.data);
    }),
  });

  const { data: composites } = useQuery<{ items: CompositeItem[]; total: number }>({
    queryKey: ['composites'],
    queryFn: () => api.get('/goes/composites').then((r) => r.data),
    refetchInterval: 5000,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/goes/composites', {
        recipe: selectedRecipe,
        satellite,
        sector,
        capture_time: new Date(captureTime).toISOString(),
      }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['composites'] });
      showToast('success', 'Composite generation started!');
    },
    onError: () => showToast('error', 'Failed to create composite'),
  });

  return (
    <div className="space-y-6">
      {/* Recipe Selection */}
      <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800 space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Layers className="w-5 h-5 text-primary" /> Composite Recipes
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(recipes ?? []).map((recipe) => (
            <button
              key={recipe.id}
              onClick={() => setSelectedRecipe(recipe.id)}
              className={`text-left p-4 rounded-xl border transition-all ${
                selectedRecipe === recipe.id
                  ? 'border-primary bg-primary/10 ring-1 ring-primary'
                  : 'border-gray-200 dark:border-slate-700 bg-gray-100/50 dark:bg-slate-800/50 hover:border-gray-300 dark:hover:border-gray-300 dark:border-slate-600 hover:bg-gray-200 dark:hover:bg-gray-100 dark:bg-slate-800'
              }`}
            >
              <div className="font-medium text-gray-900 dark:text-white text-sm">{recipe.name}</div>
              <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                {RECIPE_DESCRIPTIONS[recipe.id] || `Bands: ${recipe.bands.join(', ')}`}
              </div>
              <div className="flex gap-1 mt-2">
                {recipe.bands.map((b) => (
                  <span key={b} className="px-1.5 py-0.5 text-[10px] bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-slate-300 rounded">
                    {b}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Generate Form */}
      {selectedRecipe && (
        <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800 space-y-4">
          <h3 className="text-lg font-semibold">Generate Composite</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="comp-satellite" className="block text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">Satellite</label>
              <select id="comp-satellite" value={satellite} onChange={(e) => setSatellite(e.target.value)}
                className="w-full rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white px-3 py-2 focus:ring-2 focus:ring-primary/50 focus:outline-hidden">
                {(products?.satellites ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="comp-sector" className="block text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">Sector</label>
              <select id="comp-sector" value={sector} onChange={(e) => setSector(e.target.value)}
                className="w-full rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white px-3 py-2 focus:ring-2 focus:ring-primary/50 focus:outline-hidden">
                {(products?.sectors ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="comp-capture-time" className="block text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">Capture Time</label>
              <input id="comp-capture-time" type="datetime-local" value={captureTime} onChange={(e) => setCaptureTime(e.target.value)}
                className="w-full rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white px-3 py-2 focus:ring-2 focus:ring-primary/50 focus:outline-hidden" />
            </div>
          </div>
          <button
            onClick={() => createMutation.mutate()}
            disabled={!captureTime || createMutation.isPending}
            className="flex items-center gap-2 px-6 py-2.5 btn-primary-mix text-gray-900 dark:text-white rounded-lg disabled:opacity-50 transition-colors font-medium"
          >
            <Layers className="w-4 h-4" />
            {createMutation.isPending ? 'Generating...' : 'Generate Composite'}
          </button>
          {createMutation.isSuccess && (
            <div className="text-sm text-emerald-400 flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              Composite generation started!
            </div>
          )}
          {createMutation.isError && (
            <div className="text-sm text-red-400">Failed to create composite</div>
          )}
        </div>
      )}

      {/* History */}
      <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800 space-y-4">
        <h3 className="text-lg font-semibold">Generated Composites</h3>
        {composites && (composites.items ?? []).length > 0 ? (
          <div className="space-y-3">
            {(composites.items ?? []).map((comp) => (
              <div key={comp.id} className="flex items-center gap-4 bg-gray-100/50 dark:bg-slate-800/50 rounded-lg px-4 py-3">
                {comp.file_path && comp.status === 'completed' && (
                  <div className="w-16 h-12 rounded overflow-hidden shrink-0">
                    <img
                      src={`/api/download?path=${encodeURIComponent(comp.file_path)}`}
                      alt={comp.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">{comp.name}</div>
                  <div className="text-xs text-gray-400 dark:text-slate-500">
                    {comp.satellite} · {comp.sector} · {new Date(comp.capture_time).toLocaleString()}
                    {comp.file_size > 0 && ` · ${formatBytes(comp.file_size)}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {comp.status === 'pending' && (
                    <span className="px-2 py-1 text-xs bg-amber-600/20 text-amber-400 rounded">Pending</span>
                  )}
                  {comp.status === 'processing' && (
                    <span className="px-2 py-1 text-xs bg-primary/20 text-primary rounded animate-pulse">Processing</span>
                  )}
                  {comp.status === 'completed' && (
                    <>
                      <span className="px-2 py-1 text-xs bg-emerald-600/20 text-emerald-400 rounded">Done</span>
                      {comp.file_path && (
                        <a href={`/api/download?path=${encodeURIComponent(comp.file_path)}`}
                          download className="p-1 text-primary hover:text-primary-light transition-colors">
                          <Download className="w-4 h-4" />
                        </a>
                      )}
                    </>
                  )}
                  {comp.status === 'failed' && (
                    <span className="px-2 py-1 text-xs bg-red-600/20 text-red-400 rounded" title={comp.error}>
                      <AlertTriangle className="w-3 h-3 inline mr-1" />Failed
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-gray-400 dark:text-slate-500 py-8">
            No composites yet. Select a recipe and generate one above!
          </div>
        )}
      </div>
    </div>
  );
}
