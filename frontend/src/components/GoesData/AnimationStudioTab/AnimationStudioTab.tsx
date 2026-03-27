import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../api/client';
import { showToast } from '../../../utils/toast';
import type {
  Product,
  CollectionType,
  PaginatedFrames,
  CropPreset,
  PaginatedAnimations,
} from '../types';
import { extractArray } from '../../../utils/safeData';

import { StudioFrameSelection } from './StudioFrameSelection';
import { StudioSettings } from './StudioSettings';
import { StudioHistory } from './StudioHistory';

export default function AnimationStudioTab() {
  const queryClient = useQueryClient();

  const [selectionMode, setSelectionMode] = useState<'filters' | 'collection'>('filters');
  const [satellite, setSatellite] = useState('');
  const [band, setBand] = useState('');
  const [sector, setSector] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [collectionId, setCollectionId] = useState('');

  const [animName, setAnimName] = useState('');
  const [fps, setFps] = useState(10);
  const [format, setFormat] = useState<'mp4' | 'gif'>('mp4');
  const [quality, setQuality] = useState<'low' | 'medium' | 'high'>('medium');
  const [cropPresetId, setCropPresetId] = useState('');
  const [falseColor, setFalseColor] = useState(false);
  const [scale, setScale] = useState('100%');

  const { data: products } = useQuery<Product>({
    queryKey: ['goes-products'],
    queryFn: () => api.get('/satellite/products').then((r) => r.data),
  });

  const { data: collections } = useQuery<CollectionType[]>({
    queryKey: ['goes-collections'],
    queryFn: () => api.get('/satellite/collections').then((r) => extractArray(r.data)),
  });

  const { data: cropPresets } = useQuery<CropPreset[]>({
    queryKey: ['crop-presets'],
    queryFn: () => api.get('/satellite/crop-presets').then((r) => extractArray(r.data)),
  });

  const previewParams: Record<string, string | number> = {
    page: 1,
    limit: 20,
    sort: 'capture_time',
    order: 'asc',
  };
  if (selectionMode === 'filters') {
    if (satellite) previewParams.satellite = satellite;
    if (band) previewParams.band = band;
    if (sector) previewParams.sector = sector;
  } else if (collectionId) {
    previewParams.collection_id = collectionId;
  }

  const { data: previewFrames } = useQuery<PaginatedFrames>({
    queryKey: ['anim-preview-frames', previewParams],
    queryFn: () => api.get('/satellite/frames', { params: previewParams }).then((r) => r.data),
    enabled: selectionMode === 'collection' ? !!collectionId : !!(satellite || band || sector),
  });

  const { data: animations } = useQuery<PaginatedAnimations>({
    queryKey: ['animations'],
    queryFn: () => api.get('/satellite/animations').then((r) => r.data),
    refetchInterval: 5000,
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        name: animName || `Animation ${new Date().toLocaleString()}`,
        fps,
        format,
        quality,
        false_color: falseColor,
        scale,
      };
      if (cropPresetId) payload.crop_preset_id = cropPresetId;
      if (selectionMode === 'filters') {
        if (satellite) payload.satellite = satellite;
        if (band) payload.band = band;
        if (sector) payload.sector = sector;
        if (startDate) payload.start_date = new Date(startDate).toISOString();
        if (endDate) payload.end_date = new Date(endDate).toISOString();
      } else if (collectionId) {
        payload.collection_id = collectionId;
      }
      return api.post('/satellite/animations', payload).then((r) => r.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['animations'] });
      showToast('success', 'Animation job created!');
    },
    onError: () => showToast('error', 'Failed to create animation'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/satellite/animations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['animations'] });
      showToast('success', 'Animation deleted');
    },
    onError: () => showToast('error', 'Failed to delete animation'),
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <StudioFrameSelection
          selectionMode={selectionMode}
          setSelectionMode={setSelectionMode}
          satellite={satellite}
          setSatellite={setSatellite}
          band={band}
          setBand={setBand}
          sector={sector}
          setSector={setSector}
          startDate={startDate}
          setStartDate={setStartDate}
          endDate={endDate}
          setEndDate={setEndDate}
          collectionId={collectionId}
          setCollectionId={setCollectionId}
          products={products}
          collections={collections}
          previewFrames={previewFrames}
        />

        <StudioSettings
          animName={animName}
          setAnimName={setAnimName}
          fps={fps}
          setFps={setFps}
          format={format}
          setFormat={setFormat}
          quality={quality}
          setQuality={setQuality}
          cropPresetId={cropPresetId}
          setCropPresetId={setCropPresetId}
          falseColor={falseColor}
          setFalseColor={setFalseColor}
          scale={scale}
          setScale={setScale}
          cropPresets={cropPresets}
          canGenerate={!!previewFrames?.total}
          isPending={createMutation.isPending}
          isSuccess={createMutation.isSuccess}
          isError={createMutation.isError}
          onGenerate={() => createMutation.mutate()}
        />
      </div>

      <StudioHistory animations={animations} onDelete={(id) => deleteMutation.mutate(id)} />
    </div>
  );
}
