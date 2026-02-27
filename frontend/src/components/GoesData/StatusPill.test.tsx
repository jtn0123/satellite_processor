import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusPill from './StatusPill';

describe('StatusPill', () => {
  it('renders LIVE when not monitoring', () => {
    render(<StatusPill monitoring={false} satellite="GOES-19" band="C02" frameTime={null} />);
    expect(screen.getByTestId('status-pill')).toHaveTextContent('LIVE');
    expect(screen.getByTestId('status-pill')).toHaveTextContent('GOES-19');
    expect(screen.getByTestId('status-pill')).toHaveTextContent('C02');
  });

  it('renders MONITORING when monitoring is true', () => {
    render(<StatusPill monitoring={true} satellite="GOES-18" band="GEOCOLOR" frameTime={null} />);
    expect(screen.getByTestId('status-pill')).toHaveTextContent('MONITORING');
  });

  it('shows time ago when frameTime is provided', () => {
    const recentTime = new Date(Date.now() - 120_000).toISOString(); // 2 min ago
    render(<StatusPill monitoring={false} satellite="GOES-19" band="C13" frameTime={recentTime} />);
    expect(screen.getByTestId('status-pill')).toHaveTextContent('2 min ago');
  });

  it('does not show age when frameTime is null', () => {
    render(<StatusPill monitoring={false} satellite="GOES-19" band="C02" frameTime={null} />);
    const pill = screen.getByTestId('status-pill');
    expect(pill.textContent).not.toMatch(/\d+[mhs]/);
  });
});
