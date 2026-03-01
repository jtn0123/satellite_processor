import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MobileBottomNav from '../components/MobileBottomNav';

vi.mock('../api/client', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: {} }) },
}));

function renderNav(route = '/') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <MobileBottomNav />
    </MemoryRouter>,
  );
}

describe('MobileBottomNav restructure', () => {
  it('has Dashboard in primary tabs', () => {
    renderNav('/');
    const tabs = screen.getAllByRole('tab');
    const labels = tabs.map((t) => t.getAttribute('aria-label'));
    expect(labels).toContain('Dashboard');
  });

  it('does not have Animate in primary tabs', () => {
    renderNav('/');
    const tabs = screen.getAllByRole('tab');
    const labels = tabs.map((t) => t.getAttribute('aria-label'));
    expect(labels).not.toContain('Animate');
  });

  it('primary tabs are Live, Browse, Dashboard, Jobs, More', () => {
    renderNav('/');
    const tabs = screen.getAllByRole('tab');
    const labels = tabs.map((t) => t.getAttribute('aria-label'));
    expect(labels).toEqual(['Live', 'Browse', 'Dashboard', 'Jobs', 'More']);
  });

  it('Dashboard tab is active on / route', () => {
    renderNav('/');
    const dashTab = screen.getByRole('tab', { name: 'Dashboard' });
    expect(dashTab.getAttribute('aria-selected')).toBe('true');
  });
});
