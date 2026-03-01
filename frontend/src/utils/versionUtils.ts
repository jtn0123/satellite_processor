/**
 * Parse a semver string into [major, minor, patch].
 * Returns [0, 0, 0] for unparseable strings.
 */
export function parseSemver(version: string): readonly [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) return [0, 0, 0];
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * Returns true if the version bump is significant (major or minor changed).
 * Patch-only bumps return false.
 * If lastSeen is empty/unparseable, any valid version is significant.
 */
export function isSignificantVersionBump(lastSeen: string, current: string): boolean {
  if (!current) return false;
  if (!lastSeen) return true;

  const [lastMajor, lastMinor] = parseSemver(lastSeen);
  const [curMajor, curMinor] = parseSemver(current);

  // If either failed to parse, treat as significant
  if (lastMajor === 0 && lastMinor === 0 && curMajor === 0 && curMinor === 0) {
    return lastSeen !== current;
  }

  return curMajor !== lastMajor || curMinor !== lastMinor;
}
