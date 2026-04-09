import { describe, it, expect } from 'vitest';
import { cn } from '../utils/cn';
import {
  filterPillClasses,
  segmentedButtonClasses,
  selectableCardClasses,
  stepButtonClasses,
  stepStateClasses,
} from '../styles/variants';

describe('cn()', () => {
  it('joins truthy strings with a single space', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c');
  });

  it('skips falsy values', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b');
  });

  it('returns an empty string for no truthy inputs', () => {
    expect(cn(false, null, undefined)).toBe('');
  });

  it('accepts a conditional expression idiom', () => {
    const active = true;
    const disabled = false;
    expect(cn('base', active && 'is-active', disabled && 'is-disabled')).toBe('base is-active');
  });
});

describe('variants', () => {
  it('stepStateClasses returns distinct classes per state', () => {
    const active = stepStateClasses('active');
    const done = stepStateClasses('done');
    const pending = stepStateClasses('pending');
    expect(active).toContain('text-primary');
    expect(done).toContain('emerald');
    expect(pending).toContain('slate');
    expect(active).not.toBe(done);
    expect(done).not.toBe(pending);
  });

  it('stepButtonClasses toggles primary tint by active flag', () => {
    expect(stepButtonClasses(true)).toContain('text-primary');
    expect(stepButtonClasses(false)).not.toContain('bg-primary/10');
  });

  it('selectableCardClasses swaps border color on selection', () => {
    expect(selectableCardClasses(true)).toContain('border-primary');
    expect(selectableCardClasses(false)).toContain('border-gray-200');
  });

  it('filterPillClasses matches active vs inactive branch', () => {
    expect(filterPillClasses(true)).toContain('bg-primary/20');
    expect(filterPillClasses(false)).toContain('bg-gray-100');
  });

  it('segmentedButtonClasses matches active vs inactive branch', () => {
    expect(segmentedButtonClasses(true)).toContain('border-primary/30');
    expect(segmentedButtonClasses(false)).toContain('border-gray-200');
  });
});
