import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EmptyState from '../components/GoesData/EmptyState';
import { AlertCircle } from 'lucide-react';

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState icon={<AlertCircle />} title="No data" description="Nothing here" />);
    expect(screen.getByText('No data')).toBeTruthy();
    expect(screen.getByText('Nothing here')).toBeTruthy();
  });

  it('renders action button when provided', () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        icon={<AlertCircle />}
        title="Empty"
        description="Desc"
        action={{ label: 'Add', onClick }}
      />
    );
    const btn = screen.getByText('Add');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not render action button when not provided', () => {
    render(<EmptyState icon={<AlertCircle />} title="Empty" description="Desc" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
