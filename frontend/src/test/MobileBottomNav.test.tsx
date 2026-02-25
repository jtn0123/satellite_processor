import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MobileBottomNav from '../components/MobileBottomNav';

function renderWithRouter(initialRoute = '/goes') {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <MobileBottomNav />
    </MemoryRouter>
  );
}

describe('MobileBottomNav', () => {
  it('renders primary tab labels', () => {
    renderWithRouter();
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByText('Browse')).toBeInTheDocument();
    expect(screen.getByText('Jobs')).toBeInTheDocument();
    expect(screen.getByText('Animate')).toBeInTheDocument();
    expect(screen.getByText('More')).toBeInTheDocument();
  });

  it('renders mobile navigation landmark', () => {
    renderWithRouter();
    expect(screen.getByLabelText('Mobile navigation')).toBeInTheDocument();
  });

  it('Browse tab is active on /goes with no tab param', () => {
    renderWithRouter('/goes');
    const browseTab = screen.getByRole('tab', { name: 'Browse' });
    expect(browseTab).toHaveAttribute('aria-selected', 'true');
  });

  it('shows translucent nav on /live', () => {
    renderWithRouter('/live');
    expect(screen.getByTestId('mobile-bottom-nav')).toBeInTheDocument();
  });

  it('Animate tab is active on /animate', () => {
    renderWithRouter('/animate');
    const animateTab = screen.getByRole('tab', { name: 'Animate' });
    expect(animateTab).toHaveAttribute('aria-selected', 'true');
  });

  it('Jobs tab is active on /jobs', () => {
    renderWithRouter('/jobs');
    const jobsTab = screen.getByRole('tab', { name: 'Jobs' });
    expect(jobsTab).toHaveAttribute('aria-selected', 'true');
  });

  it('More button opens more menu', () => {
    renderWithRouter();
    fireEvent.click(screen.getByRole('tab', { name: 'More' }));
    expect(screen.getByLabelText('More navigation options')).toBeInTheDocument();
  });

  it('More menu shows Settings, Dashboard links', () => {
    renderWithRouter();
    fireEvent.click(screen.getByRole('tab', { name: 'More' }));
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('Close button inside dialog closes more menu', () => {
    renderWithRouter();
    fireEvent.click(screen.getByRole('tab', { name: 'More' }));
    expect(screen.getByLabelText('More navigation options')).toBeInTheDocument();
    const closeButtons = screen.getAllByLabelText('Close more menu');
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(screen.queryByLabelText('More navigation options')).not.toBeInTheDocument();
  });

  it('Escape key closes more menu', () => {
    renderWithRouter();
    fireEvent.click(screen.getByRole('tab', { name: 'More' }));
    expect(screen.getByLabelText('More navigation options')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByLabelText('More navigation options')).not.toBeInTheDocument();
  });

  it('overlay click closes more menu', () => {
    renderWithRouter();
    fireEvent.click(screen.getByRole('tab', { name: 'More' }));
    const overlays = screen.getAllByLabelText('Close more menu');
    fireEvent.click(overlays[0]);
    expect(screen.queryByLabelText('More navigation options')).not.toBeInTheDocument();
  });

  it('More tab shows active when on a more route like /settings', () => {
    renderWithRouter('/settings');
    const moreTab = screen.getByRole('tab', { name: 'More' });
    expect(moreTab).toHaveAttribute('aria-selected', 'true');
  });

  it('primary tabs have role=tab', () => {
    renderWithRouter();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBe(5); // 4 primary + More
  });
});
