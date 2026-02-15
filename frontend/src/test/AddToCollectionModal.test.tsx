import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AddToCollectionModal from '../components/GoesData/AddToCollectionModal';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [{ id: 'c1', name: 'Test Collection', frame_count: 5 }] })),
    post: vi.fn(() => Promise.resolve({ data: { id: 'c2' } })),
  },
}));

vi.mock('../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null }),
}));

vi.mock('../utils/toast', () => ({
  showToast: vi.fn(),
}));

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('AddToCollectionModal', () => {
  it('renders dialog with heading', () => {
    renderWithQuery(<AddToCollectionModal frameIds={['f1']} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Add to Collection')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    renderWithQuery(<AddToCollectionModal frameIds={['f1']} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close collection modal'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when overlay clicked', () => {
    const onClose = vi.fn();
    renderWithQuery(<AddToCollectionModal frameIds={['f1']} onClose={onClose} />);
    fireEvent.click(document.querySelector('.modal-overlay')!);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows new collection input', () => {
    renderWithQuery(<AddToCollectionModal frameIds={['f1']} onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText('Collection name')).toBeInTheDocument();
  });

  it('shows create button when name entered', () => {
    renderWithQuery(<AddToCollectionModal frameIds={['f1', 'f2']} onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Collection name'), { target: { value: 'New Coll' } });
    expect(screen.getByText('Create & Add 2 frames')).toBeInTheDocument();
  });

  it('shows existing collection select', () => {
    renderWithQuery(<AddToCollectionModal frameIds={['f1']} onClose={vi.fn()} />);
    expect(screen.getByText('Select...')).toBeInTheDocument();
  });

  it('responds to close-modal event', () => {
    const onClose = vi.fn();
    renderWithQuery(<AddToCollectionModal frameIds={['f1']} onClose={onClose} />);
    globalThis.dispatchEvent(new CustomEvent('close-modal'));
    expect(onClose).toHaveBeenCalled();
  });
});
