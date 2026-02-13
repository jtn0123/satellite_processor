import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConnectionStatus from '../components/ConnectionStatus';

describe('ConnectionStatus', () => {
  it('renders with disconnected status initially', () => {
    render(<ConnectionStatus />);
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });

  it('renders a status indicator dot', () => {
    const { container } = render(<ConnectionStatus />);
    const dot = container.querySelector('.rounded-full');
    expect(dot).toBeInTheDocument();
  });

  it('has red indicator when disconnected', () => {
    const { container } = render(<ConnectionStatus />);
    const dot = container.querySelector('.rounded-full');
    expect(dot?.className).toContain('bg-red-400');
  });
});
