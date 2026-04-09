/**
 * JTN-396: Mutation resilience primitives.
 *
 * Three composable pieces live here:
 *
 *   1. `withBackoff` — retries an async operation with exponential
 *      backoff capped at `MAX_BACKOFF_MS`, mirroring the pattern used
 *      by `useWebSocket.ts` so retry behavior stays consistent across
 *      WS reconnects and REST mutations.
 *
 *   2. `CircuitBreaker` — per-endpoint state machine. Opens after N
 *      consecutive failures, then half-opens after a cooldown; a
 *      single success while half-open closes it again.
 *
 *   3. `InFlightTracker` — dedupes concurrent mutations by key. If a
 *      caller invokes the same keyed mutation while the previous call
 *      is still pending, the second call is rejected with a sentinel
 *      `DuplicateMutationError` rather than hitting the network twice.
 *
 * These compose — the canonical usage is
 * `tracker.run(key, () => breaker.run(() => withBackoff(fn)))` — but
 * each piece is exported individually so that callers can opt out of
 * any layer (e.g. a mutation that is non-idempotent should skip the
 * retry layer entirely).
 *
 * The resilience layer is designed to integrate cleanly with the
 * idempotency keys produced by PR1 of the parallel batch: callers can
 * derive their dedup key from the idempotency key, and the retry loop
 * is safe because a retried mutation with the same key will be a
 * no-op on the backend.
 */

/** Cap the backoff exactly like useWebSocket so delay growth feels consistent. */
export const MAX_BACKOFF_MS = 30_000;
export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_INITIAL_DELAY_MS = 500;

/** HTTP status codes that are permanent client errors — retrying is pointless. */
const NON_RETRYABLE_STATUSES = new Set([400, 401, 403, 404, 409, 410, 422]);

export interface RetryOptions {
  /** Max attempts INCLUDING the initial attempt. Default 3. */
  readonly maxRetries?: number;
  /** Initial backoff delay in ms. Default 500. */
  readonly initialDelayMs?: number;
  /** Hard cap on individual delay. Defaults to MAX_BACKOFF_MS. */
  readonly maxDelayMs?: number;
  /** Decide if a given error should be retried. Default: retries on
   *  network errors and 5xx, not on 4xx. */
  readonly shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Sleep helper — overridable for unit tests. */
  readonly sleep?: (ms: number) => Promise<void>;
  /** Observer for each failed attempt. */
  readonly onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Extract an HTTP status from an unknown error, if present. */
export function extractStatus(error: unknown): number | null {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { status?: unknown } }).response;
    if (response && typeof response.status === 'number') {
      return response.status;
    }
  }
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === 'number') return status;
  }
  return null;
}

/** Default retry predicate: network errors and 5xx are retryable. */
export function defaultShouldRetry(error: unknown): boolean {
  const status = extractStatus(error);
  if (status == null) return true; // network / timeout / unknown
  if (NON_RETRYABLE_STATUSES.has(status)) return false;
  return status >= 500;
}

/**
 * Run `fn` with exponential backoff.
 *
 * Delay schedule (default initialDelayMs=500):
 *   attempt 1 -> 500ms
 *   attempt 2 -> 1000ms
 *   attempt 3 -> 2000ms
 *   ...capped at maxDelayMs.
 *
 * Throws the last error once `maxRetries` attempts have been exhausted.
 */
export async function withBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
    maxDelayMs = MAX_BACKOFF_MS,
    shouldRetry = defaultShouldRetry,
    sleep = defaultSleep,
    onRetry,
  } = options;

  if (maxRetries < 1) {
    throw new Error('maxRetries must be >= 1');
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === maxRetries - 1;
      if (isLastAttempt || !shouldRetry(error, attempt)) {
        throw error;
      }
      const delay = Math.min(initialDelayMs * 2 ** attempt, maxDelayMs);
      onRetry?.(error, attempt, delay);
      await sleep(delay);
    }
  }
  // Unreachable — the loop always either returns or throws.
  throw lastError;
}

/** Observable circuit-breaker state. */
export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  /** Consecutive failures before the breaker opens. Default 5. */
  readonly failureThreshold?: number;
  /** Cooldown (ms) before an open breaker transitions to half-open. Default 30s. */
  readonly cooldownMs?: number;
  /** Observer for state transitions. */
  readonly onStateChange?: (state: CircuitState) => void;
  /** Injected clock for tests. */
  readonly now?: () => number;
}

export class CircuitOpenError extends Error {
  constructor(message = 'Circuit breaker is open') {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

/**
 * Standard three-state circuit breaker.
 *
 * - `closed`: calls pass through; consecutive failures accumulate.
 * - `open`: calls are rejected with `CircuitOpenError` until cooldown.
 * - `half-open`: a single probe request is allowed; success closes the
 *   breaker, failure re-opens it with a fresh cooldown.
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private openedAt: number | null = null;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly onStateChange?: (state: CircuitState) => void;
  private readonly now: () => number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.cooldownMs = options.cooldownMs ?? MAX_BACKOFF_MS;
    this.onStateChange = options.onStateChange;
    this.now = options.now ?? (() => Date.now());
  }

  getState(): CircuitState {
    this.maybeTransitionToHalfOpen();
    return this.state;
  }

  getFailureCount(): number {
    return this.failureCount;
  }

  /** Manually reset the breaker (e.g. on user-initiated retry). */
  reset(): void {
    this.transitionTo('closed');
    this.failureCount = 0;
    this.openedAt = null;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    this.maybeTransitionToHalfOpen();
    if (this.state === 'open') {
      throw new CircuitOpenError();
    }
    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private recordSuccess(): void {
    this.failureCount = 0;
    if (this.state !== 'closed') {
      this.transitionTo('closed');
      this.openedAt = null;
    }
  }

  private recordFailure(): void {
    this.failureCount += 1;
    if (this.state === 'half-open') {
      // Failed probe — immediately re-open.
      this.openedAt = this.now();
      this.transitionTo('open');
      return;
    }
    if (this.failureCount >= this.failureThreshold) {
      this.openedAt = this.now();
      this.transitionTo('open');
    }
  }

  private maybeTransitionToHalfOpen(): void {
    if (this.state !== 'open' || this.openedAt == null) return;
    if (this.now() - this.openedAt >= this.cooldownMs) {
      this.transitionTo('half-open');
    }
  }

  private transitionTo(next: CircuitState): void {
    if (this.state === next) return;
    this.state = next;
    this.onStateChange?.(next);
  }
}

export class DuplicateMutationError extends Error {
  readonly key: string;
  constructor(key: string) {
    super(`Duplicate mutation in flight: ${key}`);
    this.name = 'DuplicateMutationError';
    this.key = key;
  }
}

/**
 * In-flight dedup: blocks concurrent calls with the same key.
 *
 * Consumers register a `key` at the start of the mutation; the tracker
 * rejects any overlapping request with the same key and automatically
 * clears the key once the first call settles.
 */
export class InFlightTracker {
  private readonly inFlight = new Map<string, Promise<unknown>>();

  isPending(key: string): boolean {
    return this.inFlight.has(key);
  }

  size(): number {
    return this.inFlight.size;
  }

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    if (this.inFlight.has(key)) {
      throw new DuplicateMutationError(key);
    }
    const promise = fn();
    this.inFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      this.inFlight.delete(key);
    }
  }
}

/**
 * Registry that keeps a `CircuitBreaker` per endpoint key. Mutation
 * hooks look up (or lazily create) their breaker here so that all
 * instances of e.g. `useCreateJob` share state and open together.
 */
export class CircuitBreakerRegistry {
  private readonly breakers = new Map<string, CircuitBreaker>();
  private readonly options: CircuitBreakerOptions;

  constructor(options: CircuitBreakerOptions = {}) {
    this.options = options;
  }

  get(key: string): CircuitBreaker {
    let breaker = this.breakers.get(key);
    if (!breaker) {
      breaker = new CircuitBreaker(this.options);
      this.breakers.set(key, breaker);
    }
    return breaker;
  }

  reset(key?: string): void {
    if (key == null) {
      this.breakers.forEach((b) => b.reset());
    } else {
      this.breakers.get(key)?.reset();
    }
  }
}

/** Shared module-level registry used by the `useResilientMutation` hook. */
export const defaultCircuitRegistry = new CircuitBreakerRegistry();
export const defaultInFlightTracker = new InFlightTracker();
