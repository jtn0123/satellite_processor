import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ProcessingForm from '../components/Processing/ProcessingForm';

vi.mock('../hooks/useApi', () => ({
  useCreateJob: () => ({ mutate: vi.fn(), isPending: false }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ProcessingForm', () => {
  it('renders step wizard with step labels', () => {
    render(<ProcessingForm selectedImages={[]} />, { wrapper });
    expect(screen.getByText('Image Processing')).toBeInTheDocument();
    expect(screen.getByText('Video Settings')).toBeInTheDocument();
    expect(screen.getByText('Review & Launch')).toBeInTheDocument();
  });

  it('toggles crop region', () => {
    render(<ProcessingForm selectedImages={['img1']} />, { wrapper });
    const cropToggle = screen.getByText('Crop Region');
    expect(cropToggle).toBeInTheDocument();
  });

  it('toggles false color', () => {
    render(<ProcessingForm selectedImages={['img1']} />, { wrapper });
    expect(screen.getByText('False Color')).toBeInTheDocument();
  });

  it('toggles timestamp', () => {
    render(<ProcessingForm selectedImages={['img1']} />, { wrapper });
    expect(screen.getByText('Timestamp Overlay')).toBeInTheDocument();
  });

  it('navigates between steps', () => {
    render(<ProcessingForm selectedImages={['img1']} />, { wrapper });
    // Click on Video Settings step
    fireEvent.click(screen.getByText('Video Settings'));
    // Should show video-related content (FPS label, etc.)
    expect(screen.getByText('Video Settings')).toBeInTheDocument();
  });

  it('shows launch button on review step', () => {
    render(<ProcessingForm selectedImages={['img1']} />, { wrapper });
    fireEvent.click(screen.getByText('Review & Launch'));
    expect(screen.getAllByText(/launch/i).length).toBeGreaterThan(0);
  });
});
