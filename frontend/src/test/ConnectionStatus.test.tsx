import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConnectionStatus from '../components/ConnectionStatus';

describe('ConnectionStatus', () => {
  it('renders nothing when disconnected (initial state)', () => {
    const { container } = render(<ConnectionStatus />);
    // Component returns null when disconnected to avoid scary status indicators
    expect(container.innerHTML).toBe('');
  });

  it('does not render a status dot when disconnected', () => {
    const { container } = render(<ConnectionStatus />);
    const dot = container.querySelector('.rounded-full');
    expect(dot).toBeNull();
  });

  it('does not show Disconnected text (hidden by design)', () => {
    render(<ConnectionStatus />);
    expect(screen.queryByText('Disconnected')).not.toBeInTheDocument();
  });
});
