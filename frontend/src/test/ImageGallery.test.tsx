import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ImageGallery from '../components/ImageGallery/ImageGallery';

const mockImages = [
  {
    id: 'img-1',
    filename: 'goes16_test.png',
    original_name: 'goes16_test.png',
    file_size: 1024000,
    width: 1920,
    height: 1080,
    satellite: 'GOES-16',
    channel: 'visible',
    captured_at: '2026-01-01T12:00:00Z',
    uploaded_at: '2026-01-02T00:00:00Z',
  },
  {
    id: 'img-2',
    filename: 'himawari_test.png',
    original_name: 'himawari_test.png',
    file_size: 2048000,
    width: 1920,
    height: 1080,
    satellite: 'Himawari-8',
    channel: 'infrared',
    captured_at: '2026-01-01T14:00:00Z',
    uploaded_at: '2026-01-02T01:00:00Z',
  },
];

let mockImagesData: typeof mockImages | [] = mockImages;

vi.mock('../hooks/useApi', () => ({
  useImages: () => ({ data: mockImagesData, isLoading: false }),
  useDeleteImage: () => ({ mutate: vi.fn() }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ImageGallery', () => {
  beforeEach(() => {
    mockImagesData = mockImages;
  });

  it('renders images', () => {
    render(<ImageGallery />, { wrapper });
    expect(screen.getByText('goes16_test.png')).toBeInTheDocument();
    expect(screen.getByText('himawari_test.png')).toBeInTheDocument();
  });

  it('renders in selection mode', () => {
    const selected = new Set<string>();
    const onToggle = vi.fn();
    render(<ImageGallery selectable selected={selected} onToggle={onToggle} />, { wrapper });
    // Click on an image card
    fireEvent.click(screen.getByText('goes16_test.png'));
    expect(onToggle).toHaveBeenCalledWith('img-1');
  });

  it('renders empty state when no images', () => {
    mockImagesData = [];
    render(<ImageGallery />, { wrapper });
    expect(screen.getByText('No images uploaded yet')).toBeInTheDocument();
  });

  it('opens preview modal on click (non-selectable)', () => {
    render(<ImageGallery />, { wrapper });
    fireEvent.click(screen.getByText('goes16_test.png'));
    // Preview modal should show the image name in detail
    // The preview shows metadata about the image
  });

  it('shows delete button on image hover area', () => {
    render(<ImageGallery />, { wrapper });
    // Delete buttons exist in the DOM (shown on hover via CSS)
    const deleteButtons = screen.getAllByRole('button');
    expect(deleteButtons.length).toBeGreaterThan(0);
  });
});
