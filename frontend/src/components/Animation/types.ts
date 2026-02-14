// Animation module types

export interface FramePreview {
  id: string;
  capture_time: string;
  thumbnail_url: string;
  satellite: string;
  band: string;
  sector: string;
}

export interface PreviewRangeResponse {
  frames: [FramePreview, FramePreview, FramePreview] | [];
  total_count: number;
  capture_interval_minutes: number;
}

export interface AnimationConfig {
  satellite: string;
  sector: string;
  band: string;
  start_date: string;
  end_date: string;
  fps: number;
  format: 'mp4' | 'gif' | 'webm';
  quality: 'low' | 'medium' | 'high';
  resolution: 'preview' | 'full';
  loop_style: 'forward' | 'pingpong' | 'hold';
  overlays: OverlayConfig;
  name: string;
}

export interface OverlayConfig {
  show_timestamp: boolean;
  show_label: boolean;
  show_colorbar: boolean;
}

export interface AnimationPreset {
  id: string;
  name: string;
  config: Omit<AnimationConfig, 'start_date' | 'end_date' | 'name'>;
  created_at: string;
}

export interface BatchItem {
  id: string;
  config: AnimationConfig;
}

export type SpeedPreset = 'realtime' | '2x' | '5x' | '10x' | 'timelapse';

export const SPEED_MULTIPLIERS: Record<SpeedPreset, number> = {
  realtime: 1,
  '2x': 2,
  '5x': 5,
  '10x': 10,
  timelapse: 30,
};

export const SATELLITES = ['GOES-16', 'GOES-18', 'GOES-19'];
export const SECTORS = ['FullDisk', 'CONUS', 'Meso1', 'Meso2'];
export const BANDS = Array.from({ length: 16 }, (_, i) => `C${String(i + 1).padStart(2, '0')}`);

export const QUICK_HOURS = [1, 3, 6, 12, 24];
