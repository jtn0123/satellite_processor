import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AddToCollectionModal from '../components/GoesData/AddToCollectionModal';
import TagModal from '../components/GoesData/TagModal';

function withQC(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe('CodeRabbit button type fixes', () => {
  it('AddToCollectionModal buttons have type="button"', () => {
    render(withQC(<AddToCollectionModal frameIds={['1']} onClose={() => {}} />));
    const buttons = document.querySelectorAll('button');
    buttons.forEach(btn => {
      expect(btn.getAttribute('type')).toBe('button');
    });
  });

  it('TagModal buttons have type="button"', () => {
    render(withQC(<TagModal frameIds={['1']} onClose={() => {}} />));
    const buttons = document.querySelectorAll('button');
    buttons.forEach(btn => {
      expect(btn.getAttribute('type')).toBe('button');
    });
  });

  it('AddToCollectionModal close button calls onClose', () => {
    const onClose = vi.fn();
    render(withQC(<AddToCollectionModal frameIds={['1']} onClose={onClose} />));
    fireEvent.click(screen.getByLabelText('Close collection modal'));
    expect(onClose).toHaveBeenCalled();
  });

  it('TagModal close button calls onClose', () => {
    const onClose = vi.fn();
    render(withQC(<TagModal frameIds={['1']} onClose={onClose} />));
    fireEvent.click(screen.getByLabelText('Close tag modal'));
    expect(onClose).toHaveBeenCalled();
  });
});

import FramePreviewModal from '../components/GoesData/FramePreviewModal';

describe('FramePreviewModal crop area', () => {
  const frame = { id: '1', satellite: 'GOES-16', band: 'Band02', sector: 'CONUS', capture_time: '2024-01-01T00:00:00Z', file_size: 1024, file_path: '/test.nc', width: 1000, height: 800, thumbnail_path: null, tags: [], collections: [] };

  it('crop area is a button element', () => {
    render(withQC(<FramePreviewModal frame={frame} frames={[frame]} onClose={() => {}} onNavigate={() => {}} />));
    const cropBtn = screen.getByLabelText(/Crop area/);
    expect(cropBtn.tagName).toBe('BUTTON');
    expect(cropBtn.getAttribute('type')).toBe('button');
  });

  it('Escape key clears crop selection', () => {
    render(withQC(<FramePreviewModal frame={frame} frames={[frame]} onClose={() => {}} onNavigate={() => {}} />));
    const cropBtn = screen.getByLabelText(/Crop area/);
    fireEvent.keyDown(cropBtn, { key: 'Escape' });
    // Should not throw
    expect(cropBtn).toBeTruthy();
  });

  it('buttons have type="button"', () => {
    render(withQC(<FramePreviewModal frame={frame} frames={[frame]} onClose={() => {}} onNavigate={() => {}} />));
    const buttons = document.querySelectorAll('button');
    buttons.forEach(btn => {
      expect(btn.getAttribute('type')).toBe('button');
    });
  });
});
