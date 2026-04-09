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
  // JTN-428: the mobile tab order now mirrors the desktop sidebar's main
  // section (Dashboard → Live → Browse → Animate). Jobs + Settings live
  // under More.
  it('has Dashboard in primary tabs', () => {
    renderNav('/');
    const tabs = screen.getAllByRole('tab');
    const labels = tabs.map((t) => t.getAttribute('aria-label'));
    expect(labels).toContain('Dashboard');
  });

  it('has Animate in primary tabs', () => {
    renderNav('/');
    const tabs = screen.getAllByRole('tab');
    const labels = tabs.map((t) => t.getAttribute('aria-label'));
    expect(labels).toContain('Animate');
  });

  it('does not have Jobs in primary tabs', () => {
    renderNav('/');
    const tabs = screen.getAllByRole('tab');
    const labels = tabs.map((t) => t.getAttribute('aria-label'));
    expect(labels).not.toContain('Jobs');
  });

  it('primary tabs are Dashboard, Live, Browse, Animate, More (desktop order)', () => {
    renderNav('/');
    const tabs = screen.getAllByRole('tab');
    const labels = tabs.map((t) => t.getAttribute('aria-label'));
    expect(labels).toEqual(['Dashboard', 'Live', 'Browse', 'Animate', 'More']);
  });

  it('Dashboard tab is active on / route', () => {
    renderNav('/');
    const dashTab = screen.getByRole('tab', { name: 'Dashboard' });
    expect(dashTab.getAttribute('aria-selected')).toBe('true');
  });
});
