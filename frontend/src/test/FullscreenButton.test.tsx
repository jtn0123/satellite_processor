import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FullscreenButton from '../components/GoesData/FullscreenButton';

describe('FullscreenButton', () => {
  it('renders enter fullscreen button', () => {
    const onClick = vi.fn();
    render(<FullscreenButton isFullscreen={false} onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Enter fullscreen' });
    expect(button).toBeInTheDocument();
  });

  it('renders exit fullscreen button', () => {
    const onClick = vi.fn();
    render(<FullscreenButton isFullscreen={true} onClick={onClick} />);
    expect(screen.getByRole('button', { name: 'Exit fullscreen' })).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<FullscreenButton isFullscreen={false} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
