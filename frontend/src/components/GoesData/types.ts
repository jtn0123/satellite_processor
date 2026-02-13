// Shared types for GoesData components

export interface Product {
  satellites: string[];
  sectors: { id: string; name: string; product: string }[];
  bands: { id: string; description: string }[];
}

export interface Gap {
  start: string;
  end: string;
  duration_minutes: number;
  expected_frames: number;
}

export interface CoverageStats {
  coverage_percent: number;
  gap_count: number;
  total_frames: number;
  expected_frames: number;
  time_range: { start: string; end: string } | null;
  gaps: Gap[];
}

export interface TagType {
  id: string;
  name: string;
  color: string;
}

export interface CollectionBrief {
  id: string;
  name: string;
}

export interface GoesFrame {
  id: string;
  satellite: string;
  sector: string;
  band: string;
  capture_time: string;
  file_path: string;
  file_size: number;
  width: number | null;
  height: number | null;
  thumbnail_path: string | null;
  tags: TagType[];
  collections: CollectionBrief[];
}

export interface CollectionType {
  id: string;
  name: string;
  description: string;
  frame_count: number;
  created_at: string;
}

export interface FrameStats {
  total_frames: number;
  total_size_bytes: number;
  by_satellite: Record<string, { count: number; size: number }>;
  by_band: Record<string, { count: number; size: number }>;
}

export interface PaginatedFrames {
  items: GoesFrame[];
  total: number;
  page: number;
  limit: number;
}

export interface CropPreset {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  created_at: string;
}

export interface AnimationType {
  id: string;
  name: string;
  status: string;
  frame_count: number;
  fps: number;
  format: string;
  quality: string;
  crop_preset_id: string | null;
  false_color: boolean;
  scale: string;
  output_path: string | null;
  file_size: number;
  duration_seconds: number;
  created_at: string;
  completed_at: string | null;
  error: string;
  job_id: string | null;
}

export interface PaginatedAnimations {
  items: AnimationType[];
  total: number;
  page: number;
  limit: number;
}

export type CropPresetType = CropPreset;
