import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InfiniteScrollSentinel, DesktopBatchActions } from './BrowseTab';
import type { GoesFrame } from './types';

function makeFrame(id: string): GoesFrame {
  return {
    id,
    satellite: 'GOES-16',
    sector: 'CONUS',
    band: 'C02',
    capture_time: '2024-01-01T00:00:00Z',
    image_url: `/img/${id}.png`,
    thumbnail_url: null,
    file_size: 1024,
    width: 100,
    height: 100,
    tags: [],
    collections: [],
  };
}

describe('InfiniteScrollSentinel', () => {
  it('renders nothing when hasNextPage is false', () => {
    const { container } = render(
      <InfiniteScrollSentinel hasNextPage={false} isFetchingNextPage={false} fetchNextPage={vi.fn()} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows loading spinner when fetching next page', () => {
    render(
      <InfiniteScrollSentinel hasNextPage={true} isFetchingNextPage={true} fetchNextPage={vi.fn()} />,
    );
    // Loader2 renders an svg with animate-spin class
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeTruthy();
  });

  it('shows Load More button when has next page and not fetching', () => {
    const fetchNextPage = vi.fn();
    render(
      <InfiniteScrollSentinel hasNextPage={true} isFetchingNextPage={false} fetchNextPage={fetchNextPage} />,
    );
    const btn = screen.getByRole('button', { name: /load more/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('type', 'button');
    fireEvent.click(btn);
    expect(fetchNextPage).toHaveBeenCalledOnce();
  });
});

describe('DesktopBatchActions', () => {
  const baseProps = {
    frames: [makeFrame('a'), makeFrame('b')],
    deleteMutation: { mutate: vi.fn() },
    processMutation: { mutate: vi.fn(), isPending: false },
    setCollectionFrameIds: vi.fn(),
    setShowAddToCollection: vi.fn(),
    setTagFrameIds: vi.fn(),
    setShowTagModal: vi.fn(),
    setCompareFrames: vi.fn(),
  };

  it('renders nothing when no items selected', () => {
    const { container } = render(
      <DesktopBatchActions {...baseProps} selectedIds={new Set()} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders action buttons when items are selected', () => {
    render(
      <DesktopBatchActions {...baseProps} selectedIds={new Set(['a'])} />,
    );
    expect(screen.getByLabelText('Delete selected frames')).toHaveAttribute('type', 'button');
    expect(screen.getByLabelText('Add to collection')).toHaveAttribute('type', 'button');
    expect(screen.getByLabelText('Tag selected frames')).toHaveAttribute('type', 'button');
    expect(screen.getByText('Process')).toBeInTheDocument();
  });

  it('calls collection handler on click', () => {
    const props = { ...baseProps, setCollectionFrameIds: vi.fn(), setShowAddToCollection: vi.fn() };
    render(<DesktopBatchActions {...props} selectedIds={new Set(['a'])} />);
    fireEvent.click(screen.getByLabelText('Add to collection'));
    expect(props.setCollectionFrameIds).toHaveBeenCalledWith(['a']);
    expect(props.setShowAddToCollection).toHaveBeenCalledWith(true);
  });

  it('calls tag handler on click', () => {
    const props = { ...baseProps, setTagFrameIds: vi.fn(), setShowTagModal: vi.fn() };
    render(<DesktopBatchActions {...props} selectedIds={new Set(['a'])} />);
    fireEvent.click(screen.getByLabelText('Tag selected frames'));
    expect(props.setTagFrameIds).toHaveBeenCalledWith(['a']);
    expect(props.setShowTagModal).toHaveBeenCalledWith(true);
  });

  it('calls process mutation on click', () => {
    const props = { ...baseProps, processMutation: { mutate: vi.fn(), isPending: false } };
    render(<DesktopBatchActions {...props} selectedIds={new Set(['a'])} />);
    fireEvent.click(screen.getByText('Process'));
    expect(props.processMutation.mutate).toHaveBeenCalledWith(['a']);
  });

  it('shows Compare button when exactly 2 items selected', () => {
    render(
      <DesktopBatchActions {...baseProps} selectedIds={new Set(['a', 'b'])} />,
    );
    expect(screen.getByText('Compare')).toBeInTheDocument();
  });

  it('shows Share button when exactly 1 item selected', () => {
    render(
      <DesktopBatchActions {...baseProps} selectedIds={new Set(['a'])} />,
    );
    expect(screen.getByText('Share')).toBeInTheDocument();
  });

  it('does not show Compare when 1 item selected', () => {
    render(
      <DesktopBatchActions {...baseProps} selectedIds={new Set(['a'])} />,
    );
    expect(screen.queryByText('Compare')).not.toBeInTheDocument();
  });

  it('calls delete with confirm', () => {
    globalThis.confirm = vi.fn(() => true);
    const props = { ...baseProps, deleteMutation: { mutate: vi.fn() } };
    render(<DesktopBatchActions {...props} selectedIds={new Set(['a'])} />);
    fireEvent.click(screen.getByLabelText('Delete selected frames'));
    expect(globalThis.confirm).toHaveBeenCalled();
    expect(props.deleteMutation.mutate).toHaveBeenCalledWith(['a']);
  });
});
