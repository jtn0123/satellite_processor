/**
 * JTN-396: Unit tests for the mutation resilience primitives.
 *
 * Coverage:
 *   - withBackoff: retry-then-success, retry-then-fail, non-retryable
 *     errors are not retried, retry count is honored, sleep is driven
 *     by injected fake clock.
 *   - CircuitBreaker: opens after threshold consecutive failures,
 *     short-circuits while open, half-opens after cooldown, closes
 *     again on successful probe, failed probe re-opens with fresh
 *     cooldown.
 *   - InFlightTracker: dedupes overlapping keys with
 *     DuplicateMutationError, allows different keys concurrently,
 *     releases the key on settle.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  withBackoff,
  CircuitBreaker,
  CircuitOpenError,
  InFlightTracker,
  DuplicateMutationError,
  defaultShouldRetry,
  extractStatus,
  MAX_BACKOFF_MS,
} from '../utils/mutationResilience';

function makeAxiosError(status: number): Error & { response: { status: number } } {
  const err = new Error(`HTTP ${status}`) as Error & { response: { status: number } };
  err.response = { status };
  return err;
}

describe('extractStatus', () => {
  it('extracts axios-style response.status', () => {
    expect(extractStatus(makeAxiosError(500))).toBe(500);
  });

  it('extracts a top-level status field', () => {
    expect(extractStatus({ status: 404 })).toBe(404);
  });

  it('returns null for plain errors', () => {
    expect(extractStatus(new Error('boom'))).toBeNull();
  });
});

describe('defaultShouldRetry', () => {
  it('retries on network errors (no status)', () => {
    expect(defaultShouldRetry(new Error('network'))).toBe(true);
  });

  it('retries on 5xx', () => {
    expect(defaultShouldRetry(makeAxiosError(500))).toBe(true);
    expect(defaultShouldRetry(makeAxiosError(503))).toBe(true);
  });

  it('does not retry on 4xx client errors', () => {
    expect(defaultShouldRetry(makeAxiosError(400))).toBe(false);
    expect(defaultShouldRetry(makeAxiosError(401))).toBe(false);
    expect(defaultShouldRetry(makeAxiosError(404))).toBe(false);
    expect(defaultShouldRetry(makeAxiosError(422))).toBe(false);
  });
});

describe('withBackoff', () => {
  it('returns the value on first success', async () => {
    const fn = vi.fn(async () => 'ok');
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
    await expect(withBackoff(fn, { sleep })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries then succeeds (retry-then-success)', async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw makeAxiosError(500);
      return 'done';
    });
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
    const onRetry = vi.fn();
    await expect(
      withBackoff(fn, { maxRetries: 5, initialDelayMs: 10, sleep, onRetry }),
    ).resolves.toBe('done');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
    // Exponential delays: 10ms, 20ms (capped by maxDelayMs).
    expect(sleep).toHaveBeenCalledWith(10);
    expect(sleep).toHaveBeenCalledWith(20);
  });

  it('gives up after maxRetries and throws the last error (retry-then-fail)', async () => {
    const err = makeAxiosError(502);
    const fn = vi.fn(async () => {
      throw err;
    });
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
    await expect(
      withBackoff(fn, { maxRetries: 3, initialDelayMs: 1, sleep }),
    ).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry on non-retryable errors (4xx)', async () => {
    const err = makeAxiosError(400);
    const fn = vi.fn(async () => {
      throw err;
    });
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
    await expect(
      withBackoff(fn, { maxRetries: 5, initialDelayMs: 1, sleep }),
    ).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('caps delay at maxDelayMs', async () => {
    const err = makeAxiosError(500);
    const fn = vi.fn(async () => {
      throw err;
    });
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
    await expect(
      withBackoff(fn, {
        maxRetries: 6,
        initialDelayMs: 10_000,
        maxDelayMs: 15_000,
        sleep,
      }),
    ).rejects.toBe(err);
    // Delays: 10000, 15000, 15000, 15000, 15000 (5 retries between 6 attempts)
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([
      10_000, 15_000, 15_000, 15_000, 15_000,
    ]);
  });

  it('defaults maxDelayMs to MAX_BACKOFF_MS', async () => {
    const err = makeAxiosError(500);
    const fn = vi.fn(async () => {
      throw err;
    });
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
    await expect(
      withBackoff(fn, { maxRetries: 10, initialDelayMs: 50_000, sleep }),
    ).rejects.toBe(err);
    sleep.mock.calls.forEach(([delay]) => {
      expect(delay).toBeLessThanOrEqual(MAX_BACKOFF_MS);
    });
  });

  it('rejects invalid maxRetries', async () => {
    await expect(withBackoff(async () => 'x', { maxRetries: 0 })).rejects.toThrow(
      'maxRetries must be >= 1',
    );
  });
});

describe('CircuitBreaker', () => {
  it('stays closed on successes and reports 0 failures', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 });
    await breaker.run(async () => 'ok');
    await breaker.run(async () => 'ok');
    expect(breaker.getState()).toBe('closed');
    expect(breaker.getFailureCount()).toBe(0);
  });

  it('opens after N consecutive failures (circuit opens)', async () => {
    const onStateChange = vi.fn();
    const breaker = new CircuitBreaker({
      failureThreshold: 3,
      cooldownMs: 1000,
      onStateChange,
    });
    const err = makeAxiosError(500);
    for (let i = 0; i < 3; i++) {
      await expect(breaker.run(async () => Promise.reject(err))).rejects.toBe(err);
    }
    expect(breaker.getState()).toBe('open');
    expect(onStateChange).toHaveBeenCalledWith('open');

    // Subsequent call short-circuits without invoking fn
    const fn = vi.fn(async () => 'should-not-run');
    await expect(breaker.run(fn)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(fn).not.toHaveBeenCalled();
  });

  it('half-opens after cooldown (circuit half-opens)', async () => {
    let now = 0;
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      cooldownMs: 1000,
      now: () => now,
    });
    await expect(breaker.run(async () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    await expect(breaker.run(async () => Promise.reject(new Error('y')))).rejects.toThrow('y');
    expect(breaker.getState()).toBe('open');

    // Advance past cooldown
    now = 1500;
    expect(breaker.getState()).toBe('half-open');

    // Successful probe closes the breaker
    await expect(breaker.run(async () => 'probe-ok')).resolves.toBe('probe-ok');
    expect(breaker.getState()).toBe('closed');
    expect(breaker.getFailureCount()).toBe(0);
  });

  it('failed probe re-opens with a fresh cooldown', async () => {
    let now = 0;
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      cooldownMs: 1000,
      now: () => now,
    });
    await expect(breaker.run(async () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    await expect(breaker.run(async () => Promise.reject(new Error('y')))).rejects.toThrow('y');

    now = 1500;
    expect(breaker.getState()).toBe('half-open');

    // Probe fails — back to open
    await expect(breaker.run(async () => Promise.reject(new Error('z')))).rejects.toThrow('z');
    expect(breaker.getState()).toBe('open');

    // Cooldown starts fresh from 1500
    now = 2000;
    expect(breaker.getState()).toBe('open');
    now = 2501;
    expect(breaker.getState()).toBe('half-open');
  });

  it('reset() forces the breaker back to closed', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 10_000 });
    await expect(breaker.run(async () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    expect(breaker.getState()).toBe('open');
    breaker.reset();
    expect(breaker.getState()).toBe('closed');
    await expect(breaker.run(async () => 'ok')).resolves.toBe('ok');
  });
});

describe('InFlightTracker', () => {
  it('releases the key after the call settles', async () => {
    const tracker = new InFlightTracker();
    await tracker.run('k', async () => 'ok');
    expect(tracker.isPending('k')).toBe(false);
    expect(tracker.size()).toBe(0);
  });

  it('releases the key after a rejected call', async () => {
    const tracker = new InFlightTracker();
    await expect(
      tracker.run('k', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(tracker.isPending('k')).toBe(false);
  });

  it('blocks duplicate concurrent calls with the same key (dedup blocks duplicates)', async () => {
    const tracker = new InFlightTracker();
    let resolveFirst!: (v: string) => void;
    const firstPromise = tracker.run(
      'same',
      () =>
        new Promise<string>((resolve) => {
          resolveFirst = resolve;
        }),
    );

    // Second call while first is pending
    await expect(tracker.run('same', async () => 'second')).rejects.toBeInstanceOf(
      DuplicateMutationError,
    );

    resolveFirst('first-done');
    await expect(firstPromise).resolves.toBe('first-done');

    // After settle, the key is free again
    await expect(tracker.run('same', async () => 'third')).resolves.toBe('third');
  });

  it('allows concurrent calls with different keys', async () => {
    const tracker = new InFlightTracker();
    const results = await Promise.all([
      tracker.run('a', async () => 'A'),
      tracker.run('b', async () => 'B'),
      tracker.run('c', async () => 'C'),
    ]);
    expect(results).toEqual(['A', 'B', 'C']);
    expect(tracker.size()).toBe(0);
  });
});

describe('composition — backoff + breaker + tracker', () => {
  it('retry-then-success does not open the breaker', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 1000 });
    const tracker = new InFlightTracker();
    let calls = 0;
    const result = await tracker.run('k', () =>
      breaker.run(() =>
        withBackoff(
          async () => {
            calls += 1;
            if (calls < 2) throw makeAxiosError(500);
            return 'ok';
          },
          { maxRetries: 3, initialDelayMs: 1, sleep: async () => {} },
        ),
      ),
    );
    expect(result).toBe('ok');
    // withBackoff absorbed the failure, so the breaker only saw one success
    expect(breaker.getState()).toBe('closed');
    expect(breaker.getFailureCount()).toBe(0);
  });

  it('retry-then-fail counts as one failure on the breaker', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 1000 });
    const err = makeAxiosError(500);
    await expect(
      breaker.run(() =>
        withBackoff(
          async () => {
            throw err;
          },
          { maxRetries: 2, initialDelayMs: 1, sleep: async () => {} },
        ),
      ),
    ).rejects.toBe(err);
    expect(breaker.getFailureCount()).toBe(1);
    expect(breaker.getState()).toBe('closed');
  });
});
