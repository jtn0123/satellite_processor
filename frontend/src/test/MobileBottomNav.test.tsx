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

describe('MobileBottomNav', () => {
  it('renders bottom tab bar with navigation role', () => {
    renderNav();
    expect(screen.getByRole('navigation', { name: 'Mobile navigation' })).toBeInTheDocument();
  });

  it('renders Live, Browse, Animate tabs', () => {
    renderNav();
    expect(screen.getByRole('tab', { name: 'Live' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Browse' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Animate' })).toBeInTheDocument();
  });

  it('renders More button', () => {
    renderNav();
    expect(screen.getByRole('tab', { name: 'More' })).toBeInTheDocument();
  });

  it('More button opens sheet with Jobs, Settings, Dashboard', () => {
    renderNav();
    fireEvent.click(screen.getByRole('tab', { name: 'More' }));
    expect(screen.getByRole('dialog', { name: 'More navigation options' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Jobs' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('closes more sheet on overlay click', () => {
    renderNav();
    fireEvent.click(screen.getByRole('tab', { name: 'More' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Click the overlay button (first one, outside the dialog)
    const closeButtons = screen.getAllByLabelText('Close more menu');
    fireEvent.click(closeButtons[0]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes more sheet on Escape key', () => {
    renderNav();
    fireEvent.click(screen.getByRole('tab', { name: 'More' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('highlights active primary tab based on route', () => {
    renderNav('/live');
    const liveTab = screen.getByRole('tab', { name: 'Live' });
    expect(liveTab.className).toContain('text-primary');
  });

  it('More button highlights when on a "more" route like /jobs', () => {
    renderNav('/jobs');
    const moreBtn = screen.getByRole('tab', { name: 'More' });
    expect(moreBtn.className).toContain('text-primary');
  });

  it('toggles more sheet open and closed', () => {
    renderNav();
    const moreBtn = screen.getByRole('tab', { name: 'More' });
    fireEvent.click(moreBtn);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(moreBtn);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('has touch-friendly min sizes on tabs', () => {
    renderNav();
    const moreBtn = screen.getByRole('tab', { name: 'More' });
    expect(moreBtn.className).toContain('min-h-[48px]');
    expect(moreBtn.className).toContain('min-w-[64px]');
  });

  it('more sheet close button has 44px touch target', () => {
    renderNav();
    fireEvent.click(screen.getByRole('tab', { name: 'More' }));
    const dialog = screen.getByRole('dialog');
    const closeBtn = dialog.querySelector('[aria-label="Close more menu"]');
    expect(closeBtn?.className).toContain('min-h-[44px]');
    expect(closeBtn?.className).toContain('min-w-[44px]');
  });
});
