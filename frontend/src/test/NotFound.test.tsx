import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotFound from '../pages/NotFound';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('NotFound', () => {
  it('renders 404 heading', () => {
    render(<NotFound />, { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> });
    expect(screen.getByText('404')).toBeInTheDocument();
  });

  it('renders page not found message', () => {
    render(<NotFound />, { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> });
    expect(screen.getByText('Page not found')).toBeInTheDocument();
  });

  it('renders back to dashboard button', () => {
    render(<NotFound />, { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> });
    expect(screen.getByText('Back to Dashboard')).toBeInTheDocument();
  });

  it('navigates home on button click', () => {
    render(<NotFound />, { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> });
    fireEvent.click(screen.getByText('Back to Dashboard'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});
