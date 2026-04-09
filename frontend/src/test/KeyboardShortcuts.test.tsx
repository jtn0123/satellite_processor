import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import KeyboardShortcuts from '../components/KeyboardShortcuts';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function openDialog() {
  act(() => {
    globalThis.dispatchEvent(new CustomEvent('toggle-keyboard-shortcuts'));
  });
}

describe('KeyboardShortcuts', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <MemoryRouter>
        <KeyboardShortcuts />
      </MemoryRouter>,
    );
    expect(container.innerHTML).toBe('');
  });

  it('dispatches close-modal on Escape keydown', () => {
    render(
      <MemoryRouter>
        <KeyboardShortcuts />
      </MemoryRouter>,
    );
    const handler = vi.fn();
    globalThis.addEventListener('close-modal', handler);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handler).toHaveBeenCalled();
    globalThis.removeEventListener('close-modal', handler);
  });

  // JTN-434: each "Go to …" row must describe a distinct destination.
  it('every navigation shortcut label is unique', () => {
    render(
      <MemoryRouter>
        <KeyboardShortcuts />
      </MemoryRouter>,
    );
    openDialog();
    const goLabels = screen.getAllByText(/^Go to /).map((el) => el.textContent ?? '');
    expect(goLabels.length).toBeGreaterThan(0);
    const dupes = goLabels.filter((l, i) => goLabels.indexOf(l) !== i);
    expect(dupes).toEqual([]);
  });

  it('labels cover Dashboard, Live, Browse & Fetch, Animate, Jobs, Settings', () => {
    render(
      <MemoryRouter>
        <KeyboardShortcuts />
      </MemoryRouter>,
    );
    openDialog();
    expect(screen.getByText('Go to Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Go to Live')).toBeInTheDocument();
    expect(screen.getByText('Go to Browse & Fetch')).toBeInTheDocument();
    expect(screen.getByText('Go to Animate')).toBeInTheDocument();
    expect(screen.getByText('Go to Jobs')).toBeInTheDocument();
    expect(screen.getByText('Go to Settings')).toBeInTheDocument();
  });
});
