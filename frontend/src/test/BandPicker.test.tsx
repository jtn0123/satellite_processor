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
    // Band cards are now div[role=button] (JTN-423) so we select by role.
    const c01 = screen.getByText('C01').closest('[role="button"]') as HTMLElement;
    fireEvent.click(c01);
    expect(onChange).toHaveBeenCalledWith('C01');
  });

  it('calls onChange when pressing Enter on a band card', () => {
    const onChange = vi.fn();
    render(<BandPicker value="C02" onChange={onChange} />, { wrapper });
    const c03 = screen.getByText('C03').closest('[role="button"]') as HTMLElement;
    fireEvent.keyDown(c03, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('C03');
  });

  it('highlights selected band', () => {
    render(<BandPicker value="C02" onChange={() => {}} />, { wrapper });
    const c02Card = screen.getByText('C02').closest('[role="button"]') as HTMLElement;
    expect(c02Card.className).toContain('border-primary');
    expect(c02Card).toHaveAttribute('aria-pressed', 'true');
  });

  it('filters bands by category', () => {
    render(<BandPicker value="C02" onChange={() => {}} />, { wrapper });
    // Click "Weather" filter
    fireEvent.click(screen.getByText('Weather'));
    // C02 should still be visible, but C03 (Veggie) should not
    expect(screen.getByText('C02')).toBeInTheDocument();
    expect(screen.queryByText('C03')).not.toBeInTheDocument();
  });

  it('marks band cards as disabled via aria-disabled when prop is true', () => {
    const onChange = vi.fn();
    render(<BandPicker value="C02" onChange={onChange} disabled />, { wrapper });
    const c01 = screen.getByText('C01').closest('[role="button"]') as HTMLElement;
    expect(c01).toHaveAttribute('aria-disabled', 'true');
    expect(c01).toHaveAttribute('tabindex', '-1');
    // Clicking a disabled card must not fire onChange.
    fireEvent.click(c01);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('no band card is a <button> (prevents nested-button invalidity)', () => {
    render(<BandPicker value="C02" onChange={() => {}} />, { wrapper });
    const c01Label = screen.getByText('C01');
    // Walk up: closest interactive ancestor must NOT be a <button>.
    const interactive = c01Label.closest('[role="button"]');
    expect(interactive).not.toBeNull();
    expect(interactive!.tagName).toBe('DIV');
  });
});
