import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EmptyState from '../components/GoesData/EmptyState';

describe('EmptyState', () => {
  it('renders icon, title, and description', () => {
    render(<EmptyState icon={<span data-testid="icon">🛰️</span>} title="No data" description="Nothing here yet" />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(screen.getByText('No data')).toBeInTheDocument();
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
  });

  it('renders action button when provided', () => {
    const onClick = vi.fn();
    render(<EmptyState icon={<span>X</span>} title="Empty" description="Desc" action={{ label: 'Do it', onClick }} />);
    const btn = screen.getByText('Do it');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not render action button when not provided', () => {
    render(<EmptyState icon={<span>X</span>} title="Empty" description="Desc" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
