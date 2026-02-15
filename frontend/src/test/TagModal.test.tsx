import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TagModal from '../components/GoesData/TagModal';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [{ id: 't1', name: 'Storm', color: '#ff0000' }] })),
    post: vi.fn(() => Promise.resolve({ data: { id: 't2', name: 'New', color: '#00ff00' } })),
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

describe('TagModal', () => {
  it('renders dialog with heading', () => {
    renderWithQuery(<TagModal frameIds={['f1']} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Tag Frames')).toBeInTheDocument();
  });

  it('calls onClose on close button click', () => {
    const onClose = vi.fn();
    renderWithQuery(<TagModal frameIds={['f1']} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close tag modal'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose on overlay click', () => {
    const onClose = vi.fn();
    renderWithQuery(<TagModal frameIds={['f1']} onClose={onClose} />);
    fireEvent.click(document.querySelector('.modal-overlay')!);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows create new tag input', () => {
    renderWithQuery(<TagModal frameIds={['f1']} onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText('Tag name')).toBeInTheDocument();
  });

  it('shows color picker', () => {
    renderWithQuery(<TagModal frameIds={['f1']} onClose={vi.fn()} />);
    const colorInput = document.querySelector('input[type="color"]');
    expect(colorInput).toBeInTheDocument();
  });

  it('responds to close-modal event', () => {
    const onClose = vi.fn();
    renderWithQuery(<TagModal frameIds={['f1']} onClose={onClose} />);
    globalThis.dispatchEvent(new CustomEvent('close-modal'));
    expect(onClose).toHaveBeenCalled();
  });

  it('has create tag button disabled when no name', () => {
    renderWithQuery(<TagModal frameIds={['f1']} onClose={vi.fn()} />);
    const addBtn = screen.getByText('+');
    expect(addBtn).toBeDisabled();
  });

  it('enables create tag button when name entered', () => {
    renderWithQuery(<TagModal frameIds={['f1']} onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Tag name'), { target: { value: 'MyTag' } });
    const addBtn = screen.getByText('+');
    expect(addBtn).not.toBeDisabled();
  });
});
