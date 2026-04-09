import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * JTN-412 ISSUE-024: regression test that the View / Delete / row-click
 * controls on the Jobs list actually call their handlers.
 *
 * Before this PR the row was a `<button>` wrapping two inner `<button>`
 * children, which is invalid HTML — browsers swallow clicks on the nested
 * buttons and neither onClick fired.
 */

const mockUseJobs = vi.fn();
const mockDeleteMutate = vi.fn();
const mockUseIsWebSocketConnected = vi.fn(() => false);

vi.mock('../hooks/useApi', () => ({
  useJobs: (...args: unknown[]) => mockUseJobs(...args),
  useDeleteJob: () => ({ mutate: mockDeleteMutate, isPending: false }),
}));

vi.mock('../components/ConnectionStatus', () => ({
  useIsWebSocketConnected: () => mockUseIsWebSocketConnected(),
  default: () => null,
}));

import JobList from '../components/Jobs/JobList';

function renderList(onSelect?: (id: string) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <JobList onSelect={onSelect} />
    </QueryClientProvider>,
  );
}

describe('JobList interaction (JTN-412 ISSUE-024)', () => {
  beforeEach(() => {
    mockUseJobs.mockReset();
    mockDeleteMutate.mockReset();
    mockUseJobs.mockReturnValue({
      data: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          job_type: 'goes_fetch',
          status: 'completed',
          progress: 100,
          status_message: 'Done',
          created_at: '2026-01-01T12:00:00Z',
        },
      ],
      isLoading: false,
    });
  });

  it('View button fires onSelect with the job id (not swallowed by parent)', () => {
    const onSelect = vi.fn();
    renderList(onSelect);
    const viewBtn = screen.getByLabelText('View job 11111111');
    fireEvent.click(viewBtn);
    expect(onSelect).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111');
  });

  it('Delete button opens the confirm dialog and dispatches delete on confirm', () => {
    renderList();
    fireEvent.click(screen.getByLabelText('Delete job 11111111'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/delete this job/i)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }));
    expect(mockDeleteMutate).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111');
  });

  it('Clicking the row itself still calls onSelect', () => {
    const onSelect = vi.fn();
    renderList(onSelect);
    // Find the outer row — it's the element with role="button" that has the
    // action icons inside it.
    const outerRow = screen.getAllByRole('button').find((el) => el.tagName === 'DIV');
    expect(outerRow).toBeTruthy();
    fireEvent.click(outerRow!);
    expect(onSelect).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111');
  });

  it('Row is keyboard activatable (Enter) without nested-button warning', () => {
    const onSelect = vi.fn();
    renderList(onSelect);
    const outerRow = screen.getAllByRole('button').find((el) => el.tagName === 'DIV');
    fireEvent.keyDown(outerRow!, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111');
  });

  it('useJobs is called with the selected backend status filter', () => {
    renderList();
    expect(mockUseJobs).toHaveBeenCalled();
    // Default = "All" → status should be undefined.
    const firstCall = mockUseJobs.mock.calls[0]?.[0];
    expect(firstCall).toEqual({ status: undefined });

    // Flipping the filter to "Failed" should pass a comma-joined status list.
    mockUseJobs.mockClear();
    fireEvent.change(screen.getByTestId('job-status-filter'), { target: { value: 'Failed' } });
    const call = mockUseJobs.mock.calls[0]?.[0];
    expect(call?.status).toMatch(/failed/);
  });
});
