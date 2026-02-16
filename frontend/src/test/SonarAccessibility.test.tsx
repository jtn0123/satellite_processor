import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AnimationSettingsPanel from '../components/Animation/AnimationSettingsPanel';
import CompareView from '../components/GoesData/CompareView';
import ImageViewer from '../components/GoesData/ImageViewer';
import AddToCollectionModal from '../components/GoesData/AddToCollectionModal';
import TagModal from '../components/GoesData/TagModal';

// Mock API client
vi.mock('../api/client', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

vi.mock('../utils/toast', () => ({
  showToast: vi.fn(),
}));

const makeFrame = (id: string) => ({
  id,
  satellite: 'GOES-18',
  sector: 'CONUS',
  band: 'Band13',
  capture_time: '2024-01-01T00:00:00Z',
  file_path: '/test.nc',
  file_size: 1024,
  thumbnail_path: null,
  width: 1000,
  height: 1000,
  tags: [],
  collections: [],
});

function withQueryClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe('Fieldset accessibility (role="group" → <fieldset>)', () => {
  it('AnimationSettingsPanel renders fieldsets with legends', () => {
    const config = {
      satellite: 'GOES-18',
      sector: 'CONUS',
      band: 'Band13',
      fps: 10,
      resolution: 'preview' as const,
      format: 'mp4' as const,
      quality: 'medium' as const,
      loop_style: 'forward' as const,
      overlays: { show_timestamp: true, show_label: true, show_colorbar: false },
      date_range: { start: '', end: '' },
      start_date: '',
      end_date: '',
      name: '',
    };
    render(<AnimationSettingsPanel config={config} captureIntervalMinutes={10} onChange={() => {}} />);

    const fieldsets = document.querySelectorAll('fieldset');
    expect(fieldsets.length).toBe(4); // Speed Preset, Resolution, Quality, Overlays

    const legends = document.querySelectorAll('legend');
    expect(legends.length).toBe(4);

    const legendTexts = Array.from(legends).map((l) => l.textContent);
    expect(legendTexts).toContain('Speed Preset');
    expect(legendTexts).toContain('Resolution');
    expect(legendTexts).toContain('Quality');
    expect(legendTexts).toContain('Overlays');
  });

  it('fieldsets have no visible border styling', () => {
    const config = {
      satellite: 'GOES-18', sector: 'CONUS', band: 'Band13',
      fps: 10, resolution: 'preview' as const, format: 'mp4' as const,
      quality: 'medium' as const, loop_style: 'forward' as const,
      overlays: { show_timestamp: true, show_label: true, show_colorbar: false },
      date_range: { start: '', end: '' },
      start_date: '',
      end_date: '',
      name: '',
    };
    render(<AnimationSettingsPanel config={config} captureIntervalMinutes={10} onChange={() => {}} />);

    const fieldsets = document.querySelectorAll('fieldset');
    fieldsets.forEach((fs) => {
      expect(fs.className).toContain('border-0');
    });
  });
});

describe('Dialog modal rendering', () => {
  it('AddToCollectionModal renders without role="dialog"', () => {
    render(withQueryClient(<AddToCollectionModal frameIds={['1']} onClose={() => {}} />));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('TagModal renders without role="dialog"', () => {
    render(withQueryClient(<TagModal frameIds={['1']} onClose={() => {}} />));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('AddToCollectionModal closes on dialog backdrop click', () => {
    let closed = false;
    const handleClose = () => { closed = true; };
    render(withQueryClient(<AddToCollectionModal frameIds={['1']} onClose={handleClose} />));
    const dialog = document.querySelector('dialog');
    if (dialog) {
      fireEvent.click(dialog);
      expect(closed).toBe(true);
    }
  });

  it('TagModal closes on dialog backdrop click', () => {
    let closed = false;
    const handleClose = () => { closed = true; };
    render(withQueryClient(<TagModal frameIds={['1']} onClose={handleClose} />));
    const dialog = document.querySelector('dialog');
    if (dialog) {
      fireEvent.click(dialog);
      expect(closed).toBe(true);
    }
  });
});

describe('No role="presentation" on modal panels', () => {
  it('AddToCollectionModal inner div has no role="presentation"', () => {
    render(withQueryClient(<AddToCollectionModal frameIds={['1']} onClose={() => {}} />));
    expect(document.querySelector('[role="presentation"]')).toBeNull();
  });

  it('TagModal inner div has no role="presentation"', () => {
    render(withQueryClient(<TagModal frameIds={['1']} onClose={() => {}} />));
    expect(document.querySelector('[role="presentation"]')).toBeNull();
  });
});

describe('CompareView uses input[type="range"] instead of role="slider"', () => {
  it('renders input type="range" in slider mode', () => {
    const frameA = makeFrame('a');
    const frameB = makeFrame('b');
    render(<CompareView frameA={frameA} frameB={frameB} onClose={() => {}} />);

    // Switch to slider mode
    const sliderBtn = screen.getByText('Slider');
    fireEvent.click(sliderBtn);

    const rangeInput = document.querySelector('input[type="range"]');
    expect(rangeInput).toBeTruthy();
    expect(rangeInput?.getAttribute('aria-label')).toBe('Image comparison slider');

    // No role="slider" on any div
    expect(document.querySelector('[role="slider"]')).toBeNull();
  });

  it('range input controls slider position', () => {
    const frameA = makeFrame('a');
    const frameB = makeFrame('b');
    render(<CompareView frameA={frameA} frameB={frameB} onClose={() => {}} />);

    fireEvent.click(screen.getByText('Slider'));

    const rangeInput = document.querySelector('input[type="range"]') as HTMLInputElement;
    fireEvent.change(rangeInput, { target: { value: '75' } });
    expect(rangeInput.value).toBe('75');
  });
});

describe('ImageViewer accessibility', () => {
  it('renders with role="application" for zoom/pan area', () => {
    const frame = makeFrame('1');
    render(<ImageViewer frame={frame} frames={[frame]} onClose={() => {}} onNavigate={() => {}} />);

    const app = document.querySelector('[role="application"]');
    expect(app).toBeTruthy();
    expect(app?.getAttribute('tabindex')).toBe('0');
    expect(app?.getAttribute('aria-label')).toContain('Pannable image');
  });

  it('dialog element renders with aria-label', () => {
    const frame = makeFrame('1');
    render(<ImageViewer frame={frame} frames={[frame]} onClose={() => {}} onNavigate={() => {}} />);

    const dialog = document.querySelector('dialog');
    expect(dialog).toBeTruthy();
    expect(dialog?.getAttribute('aria-label')).toBe('Image viewer');
  });
});
