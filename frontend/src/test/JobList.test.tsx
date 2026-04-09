import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../hooks/useApi', () => ({
  useJobs: vi.fn(() => ({
    data: [
      {
        id: 'j1abc123',
        job_type: 'goes_fetch',
        status: 'completed',
        progress: 100,
        status_message: 'Done',
        created_at: '2026-01-01T12:00:00Z',
      },
      {
        id: 'j2def456',
        job_type: 'animation',
        status: 'processing',
        progress: 50,
        status_message: 'Working',
        created_at: '2026-01-01T11:00:00Z',
      },
    ],
    isLoading: false,
  })),
  useDeleteJob: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

import JobList from '../components/Jobs/JobList';

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('JobList', () => {
  it('renders job list with status messages', () => {
    renderWithQuery(<JobList />);
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('Working')).toBeInTheDocument();
  });

  // JTN-423: nested <button> inside <button> is invalid HTML — the row
  // must not be a <button> element containing View/Delete <button> children.
  it('row is a div[role=button], not a nested <button>', () => {
    renderWithQuery(<JobList />);
    const row = screen.getByLabelText(/Open job j1abc123/);
    expect(row.tagName).toBe('DIV');
    expect(row).toHaveAttribute('role', 'button');
    expect(row).toHaveAttribute('tabindex', '0');
    // Nested action buttons are real <button> elements.
    const viewBtn = screen.getByLabelText('View job j1abc123');
    expect(viewBtn.tagName).toBe('BUTTON');
    const deleteBtn = screen.getByLabelText('Delete job j1abc123');
    expect(deleteBtn.tagName).toBe('BUTTON');
    // And the action buttons live inside the row's DOM tree.
    expect(row.contains(viewBtn)).toBe(true);
    expect(row.contains(deleteBtn)).toBe(true);
  });

  it('row is not rendered as a native <button> anywhere in the list', () => {
    const { container } = renderWithQuery(<JobList />);
    // Assert: no <button> contains another <button> (would be invalid HTML).
    const buttonsInButtons = container.querySelectorAll('button button');
    expect(buttonsInButtons.length).toBe(0);
  });

  it('Enter key on a row triggers onSelect', () => {
    const onSelect = vi.fn();
    renderWithQuery(<JobList onSelect={onSelect} />);
    const row = screen.getByLabelText(/Open job j1abc123/);
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('j1abc123');
  });

  it('View action stops click propagation so it does not double-fire', () => {
    const onSelect = vi.fn();
    renderWithQuery(<JobList onSelect={onSelect} />);
    const viewBtn = screen.getByLabelText('View job j1abc123');
    fireEvent.click(viewBtn);
    // Only a single call from the nested button (row click must be stopped).
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('j1abc123');
  });
});
