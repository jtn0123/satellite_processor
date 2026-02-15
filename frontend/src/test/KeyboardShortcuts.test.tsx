import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import KeyboardShortcuts from '../components/KeyboardShortcuts';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('KeyboardShortcuts', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<MemoryRouter><KeyboardShortcuts /></MemoryRouter>);
    expect(container.innerHTML).toBe('');
  });

  it('dispatches close-modal on Escape keydown', () => {
    render(<MemoryRouter><KeyboardShortcuts /></MemoryRouter>);
    const handler = vi.fn();
    globalThis.addEventListener('close-modal', handler);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handler).toHaveBeenCalled();
    globalThis.removeEventListener('close-modal', handler);
  });
});
