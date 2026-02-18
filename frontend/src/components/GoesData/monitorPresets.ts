export interface MonitorPreset {
  label: string;
  satellite?: string;
  sector: string;
  band?: string;
  interval: number; // ms
}

export const MONITOR_PRESETS: MonitorPreset[] = [
  { label: 'Watch CONUS every 10 min', sector: 'CONUS', interval: 600000 },
  { label: 'Full Disk hourly', sector: 'FULL', interval: 3600000 },
  { label: 'Mesoscale every 5 min', sector: 'M1', interval: 300000 },
];
