import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BandPicker from '../components/GoesData/BandPicker';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('BandPicker', () => {
  it('renders all band groups', () => {
    render(<BandPicker value="C02" onChange={() => {}} />, { wrapper });
    expect(screen.getByText('Visible')).toBeInTheDocument();
    expect(screen.getByText('Near-IR')).toBeInTheDocument();
    expect(screen.getByText('Infrared')).toBeInTheDocument();
  });

  it('shows band cards with names', () => {
    render(<BandPicker value="C02" onChange={() => {}} />, { wrapper });
    expect(screen.getByText('Red')).toBeInTheDocument();
    expect(screen.getByText('Blue')).toBeInTheDocument();
    expect(screen.getByText('Veggie')).toBeInTheDocument();
  });

  it('calls onChange when clicking a band', () => {
    const onChange = vi.fn();
    render(<BandPicker value="C02" onChange={onChange} />, { wrapper });
    fireEvent.click(screen.getByText('C01').closest('button')!);
    expect(onChange).toHaveBeenCalledWith('C01');
  });

  it('highlights selected band', () => {
    render(<BandPicker value="C02" onChange={() => {}} />, { wrapper });
    const c02Button = screen.getByText('C02').closest('button')!;
    expect(c02Button.className).toContain('border-primary');
  });

  it('filters bands by category', () => {
    render(<BandPicker value="C02" onChange={() => {}} />, { wrapper });
    // Click "Weather" filter
    fireEvent.click(screen.getByText('Weather'));
    // C02 should still be visible, but C03 (Veggie) should not
    expect(screen.getByText('C02')).toBeInTheDocument();
    expect(screen.queryByText('C03')).not.toBeInTheDocument();
  });

  it('disables buttons when disabled prop is true', () => {
    render(<BandPicker value="C02" onChange={() => {}} disabled />, { wrapper });
    const buttons = screen.getAllByRole('button');
    // Filter buttons + band buttons should be disabled
    buttons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });
});
