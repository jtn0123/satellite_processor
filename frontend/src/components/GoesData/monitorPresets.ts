export interface MonitorPreset {
  label: string;
  satellite?: string;
  sector: string;
  band?: string;
  interval: number; // ms
}

export const MONITOR_PRESETS: MonitorPreset[] = [
  // GOES presets
  { label: 'Watch CONUS every 10 min', sector: 'CONUS', interval: 600000 },
  { label: 'Full Disk hourly', sector: 'FULL', interval: 3600000 },
  { label: 'Mesoscale every 5 min', sector: 'M1', interval: 300000 },
  // Himawari presets
  {
    label: '🗾 Japan True Color 2.5min',
    satellite: 'Himawari-9',
    sector: 'Japan',
    band: 'TrueColor',
    interval: 150000,
  },
  {
    label: '🌏 FLDK IR every 10min',
    satellite: 'Himawari-9',
    sector: 'FLDK',
    band: 'B13',
    interval: 600000,
  },
  {
    label: '🎯 Target area every 30s',
    satellite: 'Himawari-9',
    sector: 'Target',
    band: 'B03',
    interval: 30000,
  },
];
