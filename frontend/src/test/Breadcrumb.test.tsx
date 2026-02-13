import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Breadcrumb from '../components/GoesData/Breadcrumb';

describe('Breadcrumb', () => {
  it('returns null for single segment', () => {
    const { container } = render(<Breadcrumb segments={[{ label: 'Home' }]} />);
    expect(container.querySelector('nav')).toBeNull();
  });

  it('renders multiple segments', () => {
    render(
      <Breadcrumb segments={[
        { label: 'Home', onClick: vi.fn() },
        { label: 'Data' },
      ]} />
    );
    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText('Data')).toBeTruthy();
  });

  it('clickable segments fire onClick', () => {
    const onClick = vi.fn();
    render(
      <Breadcrumb segments={[
        { label: 'Home', onClick },
        { label: 'Current' },
      ]} />
    );
    fireEvent.click(screen.getByText('Home'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('last segment is not clickable', () => {
    render(
      <Breadcrumb segments={[
        { label: 'Home', onClick: vi.fn() },
        { label: 'Current' },
      ]} />
    );
    const last = screen.getByText('Current');
    expect(last.tagName).toBe('SPAN');
  });

  it('has aria-label', () => {
    render(
      <Breadcrumb segments={[{ label: 'A', onClick: vi.fn() }, { label: 'B' }]} />
    );
    expect(screen.getByLabelText('Breadcrumb')).toBeTruthy();
  });
});
