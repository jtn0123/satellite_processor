import { describe, it, expect } from 'vitest';
import { parseApiError } from '../utils/parseApiError';

describe('parseApiError', () => {
  it('returns fallback for null', () => {
    expect(parseApiError(null)).toBe('An unexpected error occurred');
  });

  it('returns fallback for undefined', () => {
    expect(parseApiError(undefined)).toBe('An unexpected error occurred');
  });

  it('returns custom fallback', () => {
    expect(parseApiError(null, 'Custom error')).toBe('Custom error');
  });

  it('extracts string detail from response', () => {
    const err = { response: { data: { detail: 'Not found' } } };
    expect(parseApiError(err)).toBe('Not found');
  });

  it('strips "Value error, " prefix from detail', () => {
    const err = { response: { data: { detail: 'Value error, invalid input' } } };
    expect(parseApiError(err)).toBe('invalid input');
  });

  it('extracts first msg from Pydantic validation array', () => {
    const err = {
      response: { data: { detail: [{ msg: 'field required' }, { msg: 'too short' }] } },
    };
    expect(parseApiError(err)).toBe('field required');
  });

  it('strips "Value error, " prefix from Pydantic msg', () => {
    const err = {
      response: { data: { detail: [{ msg: 'Value error, bad value' }] } },
    };
    expect(parseApiError(err)).toBe('bad value');
  });

  it('extracts message from response data', () => {
    const err = { response: { data: { message: 'Server error' } } };
    expect(parseApiError(err)).toBe('Server error');
  });

  it('extracts message from Error object', () => {
    expect(parseApiError(new Error('Something broke'))).toBe('Something broke');
  });

  it('extracts top-level message property', () => {
    const err = { message: 'Network error' };
    expect(parseApiError(err)).toBe('Network error');
  });

  it('returns fallback for unknown shape', () => {
    expect(parseApiError({ foo: 'bar' })).toBe('An unexpected error occurred');
  });

  it('handles empty Pydantic array', () => {
    const err = { response: { data: { detail: [] } } };
    expect(parseApiError(err)).toBe('An unexpected error occurred');
  });
});
