import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WhatsNewModal from '../components/WhatsNewModal';

vi.mock('../hooks/useFocusTrap', () => ({
  useFocusTrap: (closeFn: () => void) => {
    // Return a simple ref callback
    const ref = { current: null };
    return ref;
  },
}));

describe('WhatsNewModal', () => {
  it('renders dialog element', () => {
    render(<WhatsNewModal onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows What\'s New heading', () => {
    render(<WhatsNewModal onClose={vi.fn()} />);
    expect(screen.getByText("What's New")).toBeInTheDocument();
  });

  it('renders changelog entries', () => {
    render(<WhatsNewModal onClose={vi.fn()} />);
    expect(screen.getByText(/v2\.2\.0/)).toBeInTheDocument();
    expect(screen.getByText(/v1\.2\.0/)).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<WhatsNewModal onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape pressed', () => {
    const onClose = vi.fn();
    render(<WhatsNewModal onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when overlay clicked', () => {
    const onClose = vi.fn();
    render(<WhatsNewModal onClose={onClose} />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalled();
  });

  it('has aria-label on content area', () => {
    render(<WhatsNewModal onClose={vi.fn()} />);
    expect(screen.getByLabelText("What's New")).toBeInTheDocument();
  });
});
