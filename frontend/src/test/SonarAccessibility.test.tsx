import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AnimationSettingsPanel from '../components/Animation/AnimationSettingsPanel';
import CompareView from '../components/GoesData/CompareView';
import ImageViewer from '../components/GoesData/ImageViewer';
import AddToCollectionModal from '../components/GoesData/AddToCollectionModal';
import TagModal from '../components/GoesData/TagModal';
import ComparisonModal from '../components/GoesData/ComparisonModal';
import FramePreviewModal from '../components/GoesData/FramePreviewModal';
import Modal from '../components/GoesData/Modal';

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
  thumbnail_path: null, image_url: '/api/goes/frames/test-id/image', thumbnail_url: '/api/goes/frames/test-id/thumbnail',
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
    expect(fieldsets.length).toBe(4);

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

describe('Shared Modal component', () => {
  it('renders dialog with backdrop button', () => {
    render(<Modal onClose={() => {}} ariaLabel="Test Modal"><p>Content</p></Modal>);
    expect(document.querySelector('dialog')).toBeTruthy();
    expect(screen.getByLabelText('Close modal')).toBeTruthy();
    expect(screen.getByText('Content')).toBeTruthy();
  });

  it('calls onClose when backdrop button is clicked', () => {
    const onClose = vi.fn();
    render(<Modal onClose={onClose} ariaLabel="Test Modal"><p>Hi</p></Modal>);
    fireEvent.click(screen.getByLabelText('Close modal'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose on close-modal event', () => {
    const onClose = vi.fn();
    render(<Modal onClose={onClose} ariaLabel="Test Modal"><p>Hi</p></Modal>);
    globalThis.dispatchEvent(new Event('close-modal'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('applies custom overlay and panel classNames', () => {
    render(
      <Modal onClose={() => {}} ariaLabel="Custom" overlayClassName="custom-overlay" panelClassName="custom-panel">
        <p>Custom</p>
      </Modal>
    );
    expect(document.querySelector('.custom-overlay')).toBeTruthy();
    expect(document.querySelector('.custom-panel')).toBeTruthy();
  });

  it('sets aria-label on the panel div', () => {
    render(<Modal onClose={() => {}} ariaLabel="My Dialog"><p>X</p></Modal>);
    expect(screen.getByLabelText('My Dialog')).toBeTruthy();
  });
});

describe('Dialog modal rendering', () => {
  it('AddToCollectionModal renders as dialog element', () => {
    render(withQueryClient(<AddToCollectionModal frameIds={['1']} onClose={() => {}} />));
    expect(document.querySelector('dialog')).toBeTruthy();
  });

  it('TagModal renders as dialog element', () => {
    render(withQueryClient(<TagModal frameIds={['1']} onClose={() => {}} />));
    expect(document.querySelector('dialog')).toBeTruthy();
  });

  it('AddToCollectionModal closes on backdrop button click', () => {
    const onClose = vi.fn();
    render(withQueryClient(<AddToCollectionModal frameIds={['1']} onClose={onClose} />));
    fireEvent.click(screen.getByLabelText('Close modal'));
    expect(onClose).toHaveBeenCalled();
  });

  it('TagModal closes on backdrop button click', () => {
    const onClose = vi.fn();
    render(withQueryClient(<TagModal frameIds={['1']} onClose={onClose} />));
    fireEvent.click(screen.getByLabelText('Close modal'));
    expect(onClose).toHaveBeenCalled();
  });

  it('ComparisonModal renders as dialog and closes on backdrop click', () => {
    const onClose = vi.fn();
    const frameA = makeFrame('a');
    const frameB = makeFrame('b');
    render(<ComparisonModal frameA={frameA} frameB={frameB} onClose={onClose} />);
    expect(document.querySelector('dialog')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Close modal'));
    expect(onClose).toHaveBeenCalled();
  });

  it('FramePreviewModal renders as dialog and closes on backdrop click', () => {
    const onClose = vi.fn();
    const frame = makeFrame('1');
    render(withQueryClient(<FramePreviewModal frame={frame} onClose={onClose} />));
    expect(document.querySelector('dialog')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Close modal'));
    expect(onClose).toHaveBeenCalled();
  });

  it('ComparisonModal closes on close-modal event', () => {
    const onClose = vi.fn();
    render(<ComparisonModal frameA={makeFrame('a')} frameB={makeFrame('b')} onClose={onClose} />);
    globalThis.dispatchEvent(new Event('close-modal'));
    expect(onClose).toHaveBeenCalled();
  });

  it('FramePreviewModal closes on close-modal event', () => {
    const onClose = vi.fn();
    render(withQueryClient(<FramePreviewModal frame={makeFrame('1')} onClose={onClose} />));
    globalThis.dispatchEvent(new Event('close-modal'));
    expect(onClose).toHaveBeenCalled();
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

    const sliderBtn = screen.getByText('Slider');
    fireEvent.click(sliderBtn);

    const rangeInput = document.querySelector('input[type="range"]');
    expect(rangeInput).toBeTruthy();
    expect(rangeInput?.getAttribute('aria-label')).toBe('Image comparison slider');
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
  it('renders image with descriptive alt text', () => {
    const frame = makeFrame('1');
    render(<ImageViewer frame={frame} frames={[frame]} onClose={() => {}} onNavigate={() => {}} />);

    const img = screen.getByAltText(/Use zoom buttons to zoom/);
    expect(img).toBeTruthy();
  });

  it('dialog element renders with aria-label', () => {
    const frame = makeFrame('1');
    render(<ImageViewer frame={frame} frames={[frame]} onClose={() => {}} onNavigate={() => {}} />);

    const dialog = document.querySelector('dialog');
    expect(dialog).toBeTruthy();
    expect(dialog?.getAttribute('aria-label')).toBe('Image viewer');
  });

  it('pan area is a button with aria-label', () => {
    const frame = makeFrame('1');
    render(<ImageViewer frame={frame} frames={[frame]} onClose={() => {}} onNavigate={() => {}} />);

    const panArea = screen.getByLabelText(/pan and zoom/i);
    expect(panArea).toBeTruthy();
    expect(panArea.tagName).toBe('BUTTON');
  });

  it('getCursorStyle returns default when scale <= 1', () => {
    const frame = makeFrame('1');
    render(<ImageViewer frame={frame} frames={[frame]} onClose={() => {}} onNavigate={() => {}} />);

    const img = screen.getByAltText(/Use zoom buttons to zoom/) as HTMLImageElement;
    // At default scale=1, cursor should be 'default'
    expect(img.style.cursor).toBe('default');
  });

  it('getCursorStyle returns grab when zoomed in', () => {
    const frame = makeFrame('1');
    render(<ImageViewer frame={frame} frames={[frame]} onClose={() => {}} onNavigate={() => {}} />);

    // Click zoom in button
    const zoomInBtn = screen.getByTitle('Zoom in');
    fireEvent.click(zoomInBtn);

    const img = screen.getByAltText(/Use zoom buttons to zoom/) as HTMLImageElement;
    expect(img.style.cursor).toBe('grab');
  });

  it('navigates with arrow buttons when multiple frames', () => {
    const frames = [makeFrame('1'), makeFrame('2'), makeFrame('3')];
    const onNavigate = vi.fn();
    render(<ImageViewer frame={frames[1]} frames={frames} onClose={() => {}} onNavigate={onNavigate} />);

    // Both prev and next buttons should be visible for middle frame
    const buttons = document.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(2);
  });

  it('closes on Escape key', () => {
    const onClose = vi.fn();
    const frame = makeFrame('1');
    render(<ImageViewer frame={frame} frames={[frame]} onClose={onClose} onNavigate={() => {}} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('handles wheel zoom', () => {
    const frame = makeFrame('1');
    render(<ImageViewer frame={frame} frames={[frame]} onClose={() => {}} onNavigate={() => {}} />);

    const panArea = screen.getByLabelText(/pan and zoom/i);
    fireEvent.wheel(panArea, { deltaY: -100 });

    const img = screen.getByAltText(/Use zoom buttons to zoom/) as HTMLImageElement;
    // After zooming in, cursor should change to 'grab'
    expect(img.style.cursor).toBe('grab');
  });

  it('reset zoom button works', () => {
    const frame = makeFrame('1');
    render(<ImageViewer frame={frame} frames={[frame]} onClose={() => {}} onNavigate={() => {}} />);

    // Zoom in first
    fireEvent.click(screen.getByTitle('Zoom in'));
    const img = screen.getByAltText(/Use zoom buttons to zoom/) as HTMLImageElement;
    expect(img.style.cursor).toBe('grab');

    // Reset
    fireEvent.click(screen.getByTitle('Reset zoom'));
    expect(img.style.cursor).toBe('default');
  });
});
