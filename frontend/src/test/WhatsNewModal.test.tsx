import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WhatsNewModal from '../components/WhatsNewModal';

describe('WhatsNewModal', () => {
  it('renders What\'s New heading', () => {
    render(<WhatsNewModal onClose={vi.fn()} />);
    expect(screen.getByText("What's New")).toBeInTheDocument();
  });

  it('renders changelog versions', () => {
    render(<WhatsNewModal onClose={vi.fn()} />);
    expect(screen.getByText('v2.3.0')).toBeInTheDocument();
    expect(screen.getByText('v1.1.0')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<WhatsNewModal onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose on backdrop click', () => {
    const onClose = vi.fn();
    render(<WhatsNewModal onClose={onClose} />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    render(<WhatsNewModal onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('has aria-label on panel', () => {
    render(<WhatsNewModal onClose={vi.fn()} />);
    expect(screen.getByLabelText("What's New")).toBeInTheDocument();
  });

  it('renders changelog entries as list items', () => {
    render(<WhatsNewModal onClose={vi.fn()} />);
    const items = screen.getAllByRole('listitem');
    expect(items.length).toBeGreaterThan(10);
  });
});
