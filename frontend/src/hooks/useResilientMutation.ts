/**
 * JTN-396: TanStack useMutation wrapper that composes the three
 * resilience primitives from `mutationResilience.ts`:
 *
 *   1. In-flight dedup — if the same logical mutation is fired twice,
 *      the second call short-circuits with a DuplicateMutationError
 *      rather than hitting the network.
 *
 *   2. Per-endpoint circuit breaker — after N consecutive failures,
 *      the breaker opens and further calls fail fast with
 *      CircuitOpenError until the cooldown elapses.
 *
 *   3. Exponential backoff — individual requests retry themselves
 *      with the same capped backoff as `useWebSocket.ts`.
 *
 * The hook integrates with an optional `idempotencyKey` prop so the
 * server can safely treat retries as no-ops. That prop lands here so
 * callers already passing an idempotency key (see PR1 in the parallel
 * batch) can wire it through without reshaping the mutation signature.
 */
import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import {
  withBackoff,
  defaultCircuitRegistry,
  defaultInFlightTracker,
  type RetryOptions,
  type CircuitBreakerRegistry,
  type InFlightTracker,
} from '../utils/mutationResilience';

export interface ResilientMutationOptions<TData, TError, TVariables, TContext>
  extends Omit<UseMutationOptions<TData, TError, TVariables, TContext>, 'mutationFn' | 'retry'> {
  readonly mutationFn: (variables: TVariables) => Promise<TData>;
  /**
   * Stable string identifying the endpoint. Used as the circuit-breaker
   * key so every mount of the same hook shares breaker state.
   */
  readonly endpointKey: string;
  /**
   * Derive a dedup key from the variables. If two calls produce the
   * same key while one is still in flight, the second is rejected.
   * Defaults to `${endpointKey}:${JSON.stringify(variables)}` for
   * callers that don't care about keying granularity.
   */
  readonly dedupKey?: (variables: TVariables) => string;
  /**
   * Optional idempotency key producer. When provided, the returned
   * value is attached to `variables` as `__idempotencyKey` so
   * downstream `mutationFn` implementations can forward it via an
   * `Idempotency-Key` header. This keeps the resilience layer forward-
   * compatible with PR1 of the parallel batch (which adds idempotency
   * keys on the backend). Callers that don't need it can ignore it.
   */
  readonly idempotencyKey?: (variables: TVariables) => string;
  /** Retry options forwarded to withBackoff. */
  readonly retry?: RetryOptions;
  /** Inject a custom circuit registry — primarily for tests. */
  readonly registry?: CircuitBreakerRegistry;
  /** Inject a custom in-flight tracker — primarily for tests. */
  readonly inFlightTracker?: InFlightTracker;
}

export function useResilientMutation<
  TData = unknown,
  TError = unknown,
  TVariables = void,
  TContext = unknown,
>(options: ResilientMutationOptions<TData, TError, TVariables, TContext>) {
  const {
    mutationFn,
    endpointKey,
    dedupKey,
    idempotencyKey,
    retry,
    registry = defaultCircuitRegistry,
    inFlightTracker = defaultInFlightTracker,
    ...rest
  } = options;

  const wrappedMutationFn = async (variables: TVariables): Promise<TData> => {
    const key = dedupKey?.(variables) ?? `${endpointKey}:default`;
    const breaker = registry.get(endpointKey);
    const idKey = idempotencyKey?.(variables);
    const enriched =
      idKey != null && variables != null && typeof variables === 'object'
        ? ({ ...(variables as object), __idempotencyKey: idKey } as TVariables)
        : variables;
    return inFlightTracker.run(key, () =>
      breaker.run(() => withBackoff(() => mutationFn(enriched), retry)),
    );
  };

  return useMutation<TData, TError, TVariables, TContext>({
    ...rest,
    mutationFn: wrappedMutationFn,
    // TanStack's own retry is disabled because withBackoff already
    // handles retries. Leaving `retry: 0` here prevents double-retry.
    retry: 0,
  });
}
