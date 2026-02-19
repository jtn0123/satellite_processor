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
    expect(screen.getByText('Fetch')).toBeInTheDocument();
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

  it('Live tab is active on /live', () => {
    renderWithRouter('/live');
    const liveTab = screen.getByRole('tab', { name: 'Live' });
    expect(liveTab).toHaveAttribute('aria-selected', 'true');
  });

  it('Animate tab is active on /animate', () => {
    renderWithRouter('/animate');
    const animateTab = screen.getByRole('tab', { name: 'Animate' });
    expect(animateTab).toHaveAttribute('aria-selected', 'true');
  });

  it('Fetch tab is active on /goes?tab=fetch', () => {
    renderWithRouter('/goes?tab=fetch');
    const fetchTab = screen.getByRole('tab', { name: 'Fetch' });
    expect(fetchTab).toHaveAttribute('aria-selected', 'true');
  });

  it('More button opens more menu', () => {
    renderWithRouter();
    fireEvent.click(screen.getByRole('tab', { name: 'More' }));
    expect(screen.getByLabelText('More navigation options')).toBeInTheDocument();
  });

  it('More menu shows Jobs, Settings, Dashboard links', () => {
    renderWithRouter();
    fireEvent.click(screen.getByRole('tab', { name: 'More' }));
    expect(screen.getByLabelText('Jobs')).toBeInTheDocument();
    expect(screen.getByLabelText('Settings')).toBeInTheDocument();
    expect(screen.getByLabelText('Dashboard')).toBeInTheDocument();
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

  it('More tab shows active when on a more route like /jobs', () => {
    renderWithRouter('/jobs');
    const moreTab = screen.getByRole('tab', { name: 'More' });
    expect(moreTab).toHaveAttribute('aria-selected', 'true');
  });

  it('primary tabs have role=tab', () => {
    renderWithRouter();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBe(5); // 4 primary + More
  });
});
