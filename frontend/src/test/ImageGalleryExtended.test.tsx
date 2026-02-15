import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ImageGallery from '../components/ImageGallery/ImageGallery';

const mockImages = [
  { id: 'img-1', filename: 'test.png', original_name: 'test.png', file_size: 1024, width: 100, height: 100, satellite: 'GOES-16', channel: 'visible', captured_at: '2026-01-01T00:00:00Z', uploaded_at: '2026-01-01T00:00:00Z' },
  { id: 'img-2', filename: 'test2.png', original_name: 'test2.png', file_size: 2048, width: 200, height: 200, satellite: 'GOES-18', channel: 'infrared', captured_at: '2026-01-02T00:00:00Z', uploaded_at: '2026-01-02T00:00:00Z' },
];

let isLoading = false;
let imagesData: typeof mockImages | [] = mockImages;

vi.mock('../hooks/useApi', () => ({
  useImages: () => ({ data: imagesData, isLoading }),
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

beforeEach(() => {
  imagesData = mockImages;
  isLoading = false;
});

describe('ImageGallery - lightbox', () => {
  it('opens lightbox preview dialog on image click', () => {
    render(<ImageGallery />, { wrapper });
    fireEvent.click(screen.getByText('test.png'));
    // Should now have dialog open
    const dialog = screen.getByRole('dialog', { name: /image preview/i });
    expect(dialog).toBeInTheDocument();
  });

  it('closes lightbox on close button click', () => {
    render(<ImageGallery />, { wrapper });
    fireEvent.click(screen.getByText('test.png'));
    fireEvent.click(screen.getByLabelText('Close preview'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes lightbox on Escape', () => {
    render(<ImageGallery />, { wrapper });
    fireEvent.click(screen.getByText('test.png'));
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes lightbox on overlay click', () => {
    render(<ImageGallery />, { wrapper });
    fireEvent.click(screen.getByText('test.png'));
    fireEvent.click(screen.getByRole('dialog'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('ImageGallery - sort and filter', () => {
  it('renders sort buttons', () => {
    render(<ImageGallery />, { wrapper });
    expect(screen.getByText('Date ↓')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Satellite')).toBeInTheDocument();
  });

  it('toggles sort direction on click', () => {
    render(<ImageGallery />, { wrapper });
    fireEvent.click(screen.getByText('Date ↓'));
    expect(screen.getByText('Date ↑')).toBeInTheDocument();
  });

  it('renders satellite filter', () => {
    render(<ImageGallery />, { wrapper });
    expect(screen.getByLabelText('Filter by satellite')).toBeInTheDocument();
  });

  it('renders channel filter', () => {
    render(<ImageGallery />, { wrapper });
    expect(screen.getByLabelText('Filter by channel')).toBeInTheDocument();
  });

  it('filters by satellite', () => {
    render(<ImageGallery />, { wrapper });
    fireEvent.change(screen.getByLabelText('Filter by satellite'), { target: { value: 'GOES-16' } });
    expect(screen.getByText('test.png')).toBeInTheDocument();
    expect(screen.queryByText('test2.png')).not.toBeInTheDocument();
  });
});

describe('ImageGallery - loading state', () => {
  it('shows skeleton when loading', () => {
    isLoading = true;
    const { container } = render(<ImageGallery />, { wrapper });
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });
});

describe('ImageGallery - delete with confirm', () => {
  it('has delete buttons on image cards', () => {
    render(<ImageGallery />, { wrapper });
    // Delete buttons exist in the DOM (shown on hover via CSS)
    const buttons = screen.getAllByRole('button');
    // Should have sort buttons + image buttons + delete buttons
    expect(buttons.length).toBeGreaterThan(4);
  });
});
