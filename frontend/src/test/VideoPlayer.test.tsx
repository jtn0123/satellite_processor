import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import VideoPlayer from '../components/VideoPlayer/VideoPlayer';

describe('VideoPlayer', () => {
  it('renders video element', () => {
    const { container } = render(<VideoPlayer src="/test.mp4" />);
    const video = container.querySelector('video');
    expect(video).toBeTruthy();
    expect(video?.getAttribute('src')).toBe('/test.mp4');
  });

  it('shows error state on video error', () => {
    const { container } = render(<VideoPlayer src="/bad.mp4" />);
    const video = container.querySelector('video');
    fireEvent.error(video!);
    expect(screen.getByText('Video failed to load')).toBeTruthy();
  });

  it('has controls attribute', () => {
    const { container } = render(<VideoPlayer src="/test.mp4" />);
    const video = container.querySelector('video');
    expect(video?.hasAttribute('controls')).toBe(true);
  });
});
