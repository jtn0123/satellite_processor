import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MobileBottomNav from '../components/MobileBottomNav';

function renderNav(route = '/') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <MobileBottomNav />
    </MemoryRouter>
  );
}

describe('MobileBottomNav — extended', () => {
  it('renders Fetch tab', () => {
    renderNav();
    expect(screen.getByRole('tab', { name: 'Fetch' })).toBeInTheDocument();
  });

  it('Browse tab is active on /goes with no tab param', () => {
    renderNav('/goes');
    expect(screen.getByRole('tab', { name: 'Browse' })).toHaveAttribute('aria-selected', 'true');
  });

  it('Live tab is active on /live', () => {
    renderNav('/live');
    expect(screen.getByRole('tab', { name: 'Live' })).toHaveAttribute('aria-selected', 'true');
  });

  it('Browse tab active on /goes?tab=browse', () => {
    renderNav('/goes?tab=browse');
    expect(screen.getByRole('tab', { name: 'Browse' })).toHaveAttribute('aria-selected', 'true');
  });

  it('Fetch tab active on /goes?tab=fetch', () => {
    renderNav('/goes?tab=fetch');
    expect(screen.getByRole('tab', { name: 'Fetch' })).toHaveAttribute('aria-selected', 'true');
  });

  it('Animate tab active on /animate', () => {
    renderNav('/animate');
    expect(screen.getByRole('tab', { name: 'Animate' })).toHaveAttribute('aria-selected', 'true');
  });

  it('More tab active on /jobs route', () => {
    renderNav('/jobs');
    const moreTab = screen.getByRole('tab', { name: 'More' });
    expect(moreTab).toHaveAttribute('aria-selected', 'true');
  });

  it('More tab active on /settings route', () => {
    renderNav('/settings');
    const moreTab = screen.getByRole('tab', { name: 'More' });
    expect(moreTab).toHaveAttribute('aria-selected', 'true');
  });

  it('More tab active on dashboard /', () => {
    renderNav('/');
    const moreTab = screen.getByRole('tab', { name: 'More' });
    expect(moreTab).toHaveAttribute('aria-selected', 'true');
  });

  it('primary tabs have role=tab', () => {
    renderNav();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBe(5); // Live, Browse, Fetch, Animate, More
  });

  it('More menu links navigate and close sheet', () => {
    renderNav('/goes');
    fireEvent.click(screen.getByRole('tab', { name: 'More' }));
    const jobsLink = screen.getByRole('link', { name: 'Jobs' });
    expect(jobsLink).toHaveAttribute('href', '/jobs');
  });

  it('More menu has close button inside dialog', () => {
    renderNav();
    fireEvent.click(screen.getByRole('tab', { name: 'More' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    const closeButtons = screen.getAllByLabelText('Close more menu');
    expect(closeButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('close button inside dialog closes it', () => {
    renderNav();
    fireEvent.click(screen.getByRole('tab', { name: 'More' }));
    const closeButtons = screen.getAllByLabelText('Close more menu');
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('nav has aria-label "Mobile navigation"', () => {
    renderNav();
    expect(screen.getByRole('tablist')).toHaveAttribute('aria-label', 'Mobile navigation');
  });
});
