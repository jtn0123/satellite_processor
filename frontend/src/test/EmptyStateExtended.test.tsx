import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EmptyState from '../components/GoesData/EmptyState';

describe('EmptyState', () => {
  it('renders icon, title, and description', () => {
    render(
      <EmptyState icon={<span data-testid="icon">📡</span>} title="No frames" description="Try fetching some data" />
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(screen.getByText('No frames')).toBeInTheDocument();
    expect(screen.getByText('Try fetching some data')).toBeInTheDocument();
  });

  it('renders action button when action prop provided', () => {
    const onClick = vi.fn();
    render(
      <EmptyState icon={<span>📡</span>} title="No data" description="Fetch now" action={{ label: 'Fetch', onClick }} />
    );
    const btn = screen.getByText('Fetch');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not render action button when action prop omitted', () => {
    render(<EmptyState icon={<span>📡</span>} title="Empty" description="Nothing here" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders title as h3', () => {
    render(<EmptyState icon={<span>📡</span>} title="My Title" description="desc" />);
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('My Title');
  });
});
