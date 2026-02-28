import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock child components to isolate Process page
vi.mock('../components/ImageGallery/ImageGallery', () => ({
  default: ({ onToggle, selected }: { onToggle: (id: string) => void; selected: Set<string> }) => (
    <div data-testid="image-gallery">
      <button data-testid="toggle-img1" onClick={() => onToggle('img1')}>
        Toggle img1 {selected.has('img1') ? '✓' : ''}
      </button>
      <button data-testid="toggle-img2" onClick={() => onToggle('img2')}>
        Toggle img2 {selected.has('img2') ? '✓' : ''}
      </button>
    </div>
  ),
}));

vi.mock('../components/Processing/ProcessingForm', () => ({
  default: ({ selectedImages, initialParams }: { selectedImages: string[]; initialParams: Record<string, unknown> | null }) => (
    <div data-testid="processing-form">
      <span data-testid="selected-count">{selectedImages.length}</span>
      {initialParams && <span data-testid="has-params">yes</span>}
    </div>
  ),
}));

vi.mock('../components/Processing/PresetManager', () => ({
  default: ({ onLoadPreset }: { onLoadPreset: (params: Record<string, unknown>) => void }) => (
    <div data-testid="preset-manager">
      <button data-testid="load-preset" onClick={() => onLoadPreset({ crop: true })}>Load</button>
    </div>
  ),
}));

const mockUseImages = vi.fn();
vi.mock('../hooks/useApi', () => ({
  useImages: () => mockUseImages(),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

import ProcessPage from '../pages/Process';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ProcessPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ProcessPage', () => {
  it('shows empty state when no images', () => {
    mockUseImages.mockReturnValue({ data: [] });
    renderPage();
    expect(screen.getByText('No images yet')).toBeInTheDocument();
    expect(screen.getByText('Upload Images')).toBeInTheDocument();
    expect(screen.queryByTestId('image-gallery')).not.toBeInTheDocument();
  });

  it('shows image gallery when images exist', () => {
    mockUseImages.mockReturnValue({ data: [{ id: 'img1' }, { id: 'img2' }] });
    renderPage();
    expect(screen.getByTestId('image-gallery')).toBeInTheDocument();
    expect(screen.queryByText('No images yet')).not.toBeInTheDocument();
  });

  it('toggles image selection', () => {
    mockUseImages.mockReturnValue({ data: [{ id: 'img1' }] });
    renderPage();
    fireEvent.click(screen.getByTestId('toggle-img1'));
    expect(screen.getByText('(1 selected)')).toBeInTheDocument();
  });

  it('shows processing form when images selected', () => {
    mockUseImages.mockReturnValue({ data: [{ id: 'img1' }] });
    renderPage();
    fireEvent.click(screen.getByTestId('toggle-img1'));
    expect(screen.getByTestId('processing-form')).toBeInTheDocument();
    expect(screen.getByTestId('preset-manager')).toBeInTheDocument();
  });

  it('clears selection with clear button', () => {
    mockUseImages.mockReturnValue({ data: [{ id: 'img1' }] });
    renderPage();
    fireEvent.click(screen.getByTestId('toggle-img1'));
    expect(screen.getByText('(1 selected)')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Clear selection'));
    expect(screen.getByText('(0 selected)')).toBeInTheDocument();
    expect(screen.queryByTestId('processing-form')).not.toBeInTheDocument();
  });

  it('deselects already-selected image on toggle', () => {
    mockUseImages.mockReturnValue({ data: [{ id: 'img1' }] });
    renderPage();
    fireEvent.click(screen.getByTestId('toggle-img1'));
    expect(screen.getByText('(1 selected)')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('toggle-img1'));
    expect(screen.getByText('(0 selected)')).toBeInTheDocument();
  });

  it('loads preset params into form', () => {
    mockUseImages.mockReturnValue({ data: [{ id: 'img1' }] });
    renderPage();
    fireEvent.click(screen.getByTestId('toggle-img1'));
    fireEvent.click(screen.getByTestId('load-preset'));
    expect(screen.getByTestId('has-params')).toBeInTheDocument();
  });

  it('handles undefined images data', () => {
    mockUseImages.mockReturnValue({ data: undefined });
    renderPage();
    expect(screen.getByText('No images yet')).toBeInTheDocument();
  });
});
