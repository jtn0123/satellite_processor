import { describe, it, expect } from 'vitest';
import { parseSemver, isSignificantVersionBump } from '../utils/versionUtils';

describe('parseSemver', () => {
  it('parses valid semver', () => {
    expect(parseSemver('1.24.6')).toEqual([1, 24, 6]);
  });

  it('returns [0,0,0] for empty string', () => {
    expect(parseSemver('')).toEqual([0, 0, 0]);
  });

  it('returns [0,0,0] for garbage', () => {
    expect(parseSemver('abc')).toEqual([0, 0, 0]);
  });

  it('handles version with prefix text', () => {
    // Only parses if digits at start
    expect(parseSemver('v1.2.3')).toEqual([0, 0, 0]);
  });

  it('parses version with trailing text', () => {
    expect(parseSemver('1.2.3-beta')).toEqual([1, 2, 3]);
  });
});

describe('isSignificantVersionBump', () => {
  it('returns false for empty current', () => {
    expect(isSignificantVersionBump('1.0.0', '')).toBe(false);
  });

  it('returns true for empty lastSeen', () => {
    expect(isSignificantVersionBump('', '1.0.0')).toBe(true);
  });

  it('returns false for patch-only bump', () => {
    expect(isSignificantVersionBump('1.24.5', '1.24.6')).toBe(false);
  });

  it('returns true for minor bump', () => {
    expect(isSignificantVersionBump('1.23.0', '1.24.0')).toBe(true);
  });

  it('returns true for major bump', () => {
    expect(isSignificantVersionBump('1.24.6', '2.0.0')).toBe(true);
  });

  it('returns true when lastSeen is unparseable and versions differ', () => {
    expect(isSignificantVersionBump('unknown', 'also-unknown')).toBe(true);
  });

  it('returns false when both unparseable but equal', () => {
    expect(isSignificantVersionBump('dev', 'dev')).toBe(false);
  });
});
