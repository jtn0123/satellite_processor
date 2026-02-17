import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SectorPicker from '../components/GoesData/SectorPicker';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);

const MOCK_SECTORS = [
  { id: 'FullDisk', name: 'FullDisk', cadence_minutes: 10, typical_file_size_kb: 12000 },
  { id: 'CONUS', name: 'CONUS', cadence_minutes: 5, typical_file_size_kb: 4000 },
  { id: 'Mesoscale1', name: 'Mesoscale1', cadence_minutes: 1, typical_file_size_kb: 500 },
  { id: 'Mesoscale2', name: 'Mesoscale2', cadence_minutes: 1, typical_file_size_kb: 500 },
];

describe('SectorPicker', () => {
  it('renders all sectors', () => {
    wrap(<SectorPicker value="CONUS" onChange={() => {}} sectors={MOCK_SECTORS} />);
    expect(screen.getByText('FullDisk')).toBeInTheDocument();
    expect(screen.getByText('CONUS')).toBeInTheDocument();
    expect(screen.getByText('Mesoscale1')).toBeInTheDocument();
  });

  it('shows cadence info', () => {
    wrap(<SectorPicker value="CONUS" onChange={() => {}} sectors={MOCK_SECTORS} />);
    expect(screen.getByText('Every 5 min')).toBeInTheDocument();
    expect(screen.getByText('Every 10 min')).toBeInTheDocument();
  });

  it('shows high cadence warning for Mesoscale', () => {
    wrap(<SectorPicker value="CONUS" onChange={() => {}} sectors={MOCK_SECTORS} />);
    const warnings = screen.getAllByText('High cadence');
    expect(warnings.length).toBe(2); // Meso1 and Meso2
  });

  it('calls onChange when clicking a sector', () => {
    const onChange = vi.fn();
    wrap(<SectorPicker value="CONUS" onChange={onChange} sectors={MOCK_SECTORS} />);
    fireEvent.click(screen.getByText('FullDisk').closest('button')!);
    expect(onChange).toHaveBeenCalledWith('FullDisk');
  });

  it('highlights selected sector', () => {
    wrap(<SectorPicker value="CONUS" onChange={() => {}} sectors={MOCK_SECTORS} />);
    const conusBtn = screen.getByText('CONUS').closest('button')!;
    expect(conusBtn.className).toContain('border-primary');
  });

  it('shows hourly estimates', () => {
    wrap(<SectorPicker value="CONUS" onChange={() => {}} sectors={MOCK_SECTORS} />);
    // CONUS: 12 frames/hour × 4MB = 48MB
    expect(screen.getByText(/12 frames/)).toBeInTheDocument();
  });
});
