import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import KeyboardShortcuts from '../components/KeyboardShortcuts';

vi.mock('../hooks/useHotkeys', () => ({
  useHotkeys: vi.fn(),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('KeyboardShortcuts', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<KeyboardShortcuts />, { wrapper });
    expect(container.querySelector('dialog')).toBeNull();
  });
});
