import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MobileBottomNav from '../components/MobileBottomNav';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

afterEach(() => {
  mockNavigate.mockClear();
});

function renderNav(route = '/goes') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <MobileBottomNav />
    </MemoryRouter>
  );
}

describe('MobileBottomNav — click handlers', () => {
  it('clicking Live tab navigates to /live', () => {
    renderNav();
    fireEvent.click(screen.getByRole('tab', { name: 'Live' }));
    expect(mockNavigate).toHaveBeenCalledWith('/live');
  });

  it('clicking Browse tab navigates to /goes', () => {
    renderNav('/goes');
    fireEvent.click(screen.getByRole('tab', { name: 'Browse' }));
    expect(mockNavigate).toHaveBeenCalledWith('/goes');
  });

  it('clicking Dashboard tab navigates to /', () => {
    renderNav();
    fireEvent.click(screen.getByRole('tab', { name: 'Dashboard' }));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('clicking Jobs tab navigates to /jobs', () => {
    renderNav();
    fireEvent.click(screen.getByRole('tab', { name: 'Jobs' }));
    expect(mockNavigate).toHaveBeenCalledWith('/jobs');
  });

  it('clicking a primary tab closes the more menu if open', () => {
    renderNav();
    // Open more menu
    fireEvent.click(screen.getByRole('tab', { name: 'More' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Click Live tab
    fireEvent.click(screen.getByRole('tab', { name: 'Live' }));
    // More menu should be closed
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Escape key closes the more menu', () => {
    renderNav();
    fireEvent.click(screen.getByRole('tab', { name: 'More' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('overlay click closes the more menu', () => {
    renderNav();
    fireEvent.click(screen.getByRole('tab', { name: 'More' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Click the overlay (first "Close more menu" button is the overlay)
    const overlays = screen.getAllByLabelText('Close more menu');
    fireEvent.click(overlays[0]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
