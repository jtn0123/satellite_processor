export interface BandInfo {
  name: string;
  wavelength: string;
  category: string;
  color: string;
  description: string;
}

export const BAND_INFO: Record<string, BandInfo> = {
  C01: { name: "Blue", wavelength: "0.47μm", category: "Visible", color: "#3b82f6", description: "Daytime aerosol, smoke detection" },
  C02: { name: "Red", wavelength: "0.64μm", category: "Visible", color: "#ef4444", description: "Primary visible band, clouds & surface" },
  C03: { name: "Veggie", wavelength: "0.86μm", category: "Near-IR", color: "#22c55e", description: "Vegetation, burn scars, aerosols" },
  C04: { name: "Cirrus", wavelength: "1.37μm", category: "Near-IR", color: "#a855f7", description: "Cirrus cloud detection" },
  C05: { name: "Snow/Ice", wavelength: "1.61μm", category: "Near-IR", color: "#06b6d4", description: "Snow/ice discrimination, cloud phase" },
  C06: { name: "Cloud Particle", wavelength: "2.24μm", category: "Near-IR", color: "#f97316", description: "Cloud particle size, snow" },
  C07: { name: "Shortwave IR", wavelength: "3.9μm", category: "IR", color: "#dc2626", description: "Fire detection, fog at night" },
  C08: { name: "Upper Tropo WV", wavelength: "6.2μm", category: "IR", color: "#6366f1", description: "Upper-level water vapor, jets" },
  C09: { name: "Mid Tropo WV", wavelength: "6.9μm", category: "IR", color: "#8b5cf6", description: "Mid-level water vapor" },
  C10: { name: "Lower Tropo WV", wavelength: "7.3μm", category: "IR", color: "#a78bfa", description: "Lower-level water vapor, SO₂" },
  C11: { name: "Cloud-Top Phase", wavelength: "8.4μm", category: "IR", color: "#14b8a6", description: "Cloud-top phase, dust" },
  C12: { name: "Ozone", wavelength: "9.6μm", category: "IR", color: "#84cc16", description: "Total ozone, turbulence" },
  C13: { name: "Clean IR", wavelength: "10.3μm", category: "IR", color: "#eab308", description: "Clean IR window, clouds & surface temp" },
  C14: { name: "IR Longwave", wavelength: "11.2μm", category: "IR", color: "#f59e0b", description: "IR longwave window, cloud-top temp" },
  C15: { name: "Dirty IR", wavelength: "12.3μm", category: "IR", color: "#d97706", description: "Dirty IR, volcanic ash" },
  C16: { name: "CO₂ Longwave", wavelength: "13.3μm", category: "IR", color: "#78716c", description: "CO₂ longwave, cloud-top height" },
};

export function getBandLabel(bandId: string): string {
  const info = BAND_INFO[bandId];
  if (!info) return bandId;
  return `${bandId} — ${info.name} (${info.wavelength})`;
}
