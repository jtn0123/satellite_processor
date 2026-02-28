import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../components/GoesData/CdnImage', () => ({
  default: (props: Record<string, unknown>) => <img data-testid="cdn-image" alt={props.alt as string} />,
}));
vi.mock('../components/GoesData/CompareSlider', () => ({
  default: () => <div data-testid="compare-slider" />,
}));
vi.mock('../components/GoesData/ShimmerLoader', () => ({
  default: () => <div data-testid="shimmer-loader" />,
}));

import ImagePanelContent from '../components/GoesData/ImagePanelContent';
import type { ImagePanelContentProps } from '../components/GoesData/ImagePanelContent';

function makeProps(overrides: Partial<ImagePanelContentProps> = {}): ImagePanelContentProps {
  return {
    isLoading: false,
    isError: false,
    imageUrl: 'https://example.com/image.jpg',
    compareMode: false,
    satellite: 'GOES-18',
    band: 'Band02',
    sector: 'CONUS',
    zoomStyle: {},
    prevImageUrl: null,
    comparePosition: 50,
    onPositionChange: vi.fn(),
    frameTime: '2024-01-01T00:00:00Z',
    prevFrameTime: null,
    ...overrides,
  };
}

describe('ImagePanelContent', () => {
  it('shows shimmer when loading', () => {
    render(<ImagePanelContent {...makeProps({ isLoading: true })} />);
    expect(screen.getByTestId('loading-shimmer')).toBeInTheDocument();
  });

  it('shows shimmer when no imageUrl and not error', () => {
    render(<ImagePanelContent {...makeProps({ imageUrl: null })} />);
    expect(screen.getByTestId('loading-shimmer')).toBeInTheDocument();
  });

  it('shows error state when error and no image', () => {
    render(<ImagePanelContent {...makeProps({ isError: true, imageUrl: null })} />);
    expect(screen.getByTestId('live-error-state')).toBeInTheDocument();
    expect(screen.getByText('Image unavailable · Retrying…')).toBeInTheDocument();
  });

  it('shows compare slider in compare mode', () => {
    render(<ImagePanelContent {...makeProps({ compareMode: true })} />);
    expect(screen.getByTestId('compare-slider')).toBeInTheDocument();
  });

  it('shows CdnImage in normal mode', () => {
    render(<ImagePanelContent {...makeProps()} />);
    expect(screen.getByTestId('cdn-image')).toBeInTheDocument();
    expect(screen.getByAltText('GOES-18 Band02 CONUS')).toBeInTheDocument();
  });

  it('shows image even when error but imageUrl exists', () => {
    render(<ImagePanelContent {...makeProps({ isError: true })} />);
    expect(screen.getByTestId('cdn-image')).toBeInTheDocument();
  });
});
