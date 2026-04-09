import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DateTimeField } from '../components/ui/DateTimeField';
import { defaultDateTimeRange, nowForDateTimeLocal } from '../components/ui/dateTimeHelpers';

describe('DateTimeField', () => {
  it('exposes a single accessible name from its <label>', () => {
    render(<DateTimeField label="Start date and time" value="" onChange={() => {}} />);
    const input = screen.getByLabelText('Start date and time');
    expect(input).toBeInTheDocument();
    // Accessible name should be exactly the label — no doubling.
    expect(input).toHaveAccessibleName('Start date and time');
  });

  it('allows two sibling pickers to have distinct names (no "Start Start")', () => {
    render(
      <>
        <DateTimeField label="Start date and time" value="" onChange={() => {}} />
        <DateTimeField label="End date and time" value="" onChange={() => {}} />
      </>,
    );
    expect(screen.getByLabelText('Start date and time')).toBeInTheDocument();
    expect(screen.getByLabelText('End date and time')).toBeInTheDocument();
  });

  it('does not set a redundant aria-label alongside the <label>', () => {
    render(<DateTimeField label="Start date and time" value="" onChange={() => {}} />);
    const input = screen.getByLabelText('Start date and time');
    // aria-label must NOT duplicate the visible label — otherwise AT would
    // concatenate "Start date and time" with each native spinbutton name.
    expect(input).not.toHaveAttribute('aria-label');
  });

  it('calls onChange with the new value', () => {
    const onChange = vi.fn();
    render(<DateTimeField label="Start date and time" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Start date and time'), {
      target: { value: '2026-04-08T10:00' },
    });
    expect(onChange).toHaveBeenCalledWith('2026-04-08T10:00');
  });

  it('supports a hint with aria-describedby', () => {
    render(<DateTimeField label="Start" value="" onChange={() => {}} hint="UTC — not local" />);
    const input = screen.getByLabelText('Start');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toBe('UTC — not local');
  });
});

describe('nowForDateTimeLocal', () => {
  it('formats a Date as YYYY-MM-DDTHH:mm (no Month=0)', () => {
    const formatted = nowForDateTimeLocal(new Date(2026, 3, 8, 14, 30)); // Apr 8 2026 14:30
    expect(formatted).toBe('2026-04-08T14:30');
  });

  it('pads single-digit month/day/hour/minute', () => {
    const formatted = nowForDateTimeLocal(new Date(2026, 0, 1, 3, 5));
    expect(formatted).toBe('2026-01-01T03:05');
  });
});

describe('defaultDateTimeRange', () => {
  it('returns start = now − hoursBack and end = now', () => {
    const now = new Date(2026, 3, 8, 14, 30);
    const range = defaultDateTimeRange(1, now);
    expect(range.end).toBe('2026-04-08T14:30');
    expect(range.start).toBe('2026-04-08T13:30');
  });

  it('never returns empty strings (avoids Month=0 defaults)', () => {
    const range = defaultDateTimeRange();
    expect(range.start).not.toBe('');
    expect(range.end).not.toBe('');
    expect(range.start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(range.end).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});
