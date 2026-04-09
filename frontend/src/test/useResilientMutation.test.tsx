/**
 * JTN-396: Integration tests for the useResilientMutation hook.
 *
 * These confirm the hook wires the three primitives together as
 * expected under a TanStack Query provider, without needing the real
 * network. Each test uses an isolated registry + tracker so they
 * don't pollute the shared module-level singletons.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useResilientMutation } from '../hooks/useResilientMutation';
import {
  CircuitBreakerRegistry,
  InFlightTracker,
  DuplicateMutationError,
  CircuitOpenError,
} from '../utils/mutationResilience';

/**
 * Produce a stable wrapper factory. If we recreate the QueryClient per
 * render-pass, renderHook silently unmounts+remounts and `result.current`
 * turns to null between awaits, which breaks everything subtly.
 */
function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return Wrapper;
}

function makeAxiosError(status: number): Error & { response: { status: number } } {
  const err = new Error(`HTTP ${status}`) as Error & { response: { status: number } };
  err.response = { status };
  return err;
}

describe('useResilientMutation', () => {
  it('retries then succeeds and returns the value', async () => {
    let calls = 0;
    const mutationFn = vi.fn<(v: string) => Promise<string>>(async () => {
      calls += 1;
      if (calls < 2) throw makeAxiosError(503);
      return 'done';
    });
    const registry = new CircuitBreakerRegistry();
    const inFlightTracker = new InFlightTracker();

    const { result } = renderHook(
      () =>
        useResilientMutation<string, unknown, string>({
          mutationFn,
          endpointKey: 'test:retry-success',
          dedupKey: (v) => `k:${v}`,
          retry: { maxRetries: 3, initialDelayMs: 1, sleep: async () => {} },
          registry,
          inFlightTracker,
        }),
      { wrapper: makeWrapper() },
    );

    await act(async () => {
      const value = await result.current.mutateAsync('v1');
      expect(value).toBe('done');
    });
    expect(calls).toBe(2);
  });

  it('surfaces circuit-open errors after repeated failures', async () => {
    const err = makeAxiosError(500);
    const mutationFn = vi.fn(async () => {
      throw err;
    });
    const registry = new CircuitBreakerRegistry({ failureThreshold: 2, cooldownMs: 10_000 });
    const inFlightTracker = new InFlightTracker();

    const { result } = renderHook(
      () =>
        useResilientMutation<string, unknown, string>({
          mutationFn,
          endpointKey: 'test:open',
          dedupKey: (v) => `k:${v}`,
          retry: { maxRetries: 1, initialDelayMs: 1, sleep: async () => {} },
          registry,
          inFlightTracker,
        }),
      { wrapper: makeWrapper() },
    );

    // Cache mutateAsync before each call — TanStack v5 renders new
    // refs as the mutation moves between idle/pending/error, which
    // can transiently surface as result.current being null inside
    // back-to-back act() calls.
    const run = (arg: string) => result.current.mutateAsync(arg);

    // Two failures reach the breaker (1 attempt each since maxRetries=1)
    await act(async () => {
      await expect(run('a')).rejects.toBe(err);
    });
    await act(async () => {
      await expect(run('b')).rejects.toBe(err);
    });

    // Breaker is now open; third call short-circuits.
    await act(async () => {
      await expect(run('c')).rejects.toBeInstanceOf(CircuitOpenError);
    });
    expect(mutationFn).toHaveBeenCalledTimes(2);
  });

  it('blocks duplicate concurrent calls via the dedup tracker', async () => {
    // We drive the mutationFn with an external deferred so we can
    // control exactly when the first call resolves. Keeping both
    // mutation promises in scope lets us assert DuplicateMutationError
    // without leaving a hanging promise that can unmount the hook.
    interface Deferred {
      resolve: (v: string) => void;
      promise: Promise<string>;
    }
    const deferred: Deferred = {
      resolve: () => {},
      promise: null as unknown as Promise<string>,
    };
    deferred.promise = new Promise<string>((resolve) => {
      deferred.resolve = resolve;
    });
    const mutationFn = vi.fn<(v: string) => Promise<string>>(() => deferred.promise);

    const registry = new CircuitBreakerRegistry();
    const inFlightTracker = new InFlightTracker();

    const { result } = renderHook(
      () =>
        useResilientMutation<string, unknown, string>({
          mutationFn,
          endpointKey: 'test:dedup',
          dedupKey: () => 'same-key',
          retry: { maxRetries: 1, initialDelayMs: 1, sleep: async () => {} },
          registry,
          inFlightTracker,
        }),
      { wrapper: makeWrapper() },
    );

    // Kick off two concurrent mutations in the same act so that React
    // sees a stable state transition (pending → settled) at the end.
    let firstPromise!: Promise<string>;
    let secondPromise!: Promise<string>;
    await act(async () => {
      firstPromise = result.current.mutateAsync('one').catch((e: unknown) => {
        throw e;
      });
      secondPromise = result.current.mutateAsync('two').catch((e: unknown) => {
        throw e;
      });
      // Second call should reject synchronously with DuplicateMutationError
      // because the tracker short-circuits before it ever hits mutationFn.
      await expect(secondPromise).rejects.toBeInstanceOf(DuplicateMutationError);
      // Now resolve the first one and await it
      deferred.resolve('first-done');
      await expect(firstPromise).resolves.toBe('first-done');
    });
    expect(mutationFn).toHaveBeenCalledTimes(1);
    expect(inFlightTracker.size()).toBe(0);
  });

  it('threads an idempotency key onto object variables', async () => {
    const seen: unknown[] = [];
    const mutationFn = vi.fn(async (vars: { name: string }) => {
      seen.push(vars);
      return 'ok';
    });
    const registry = new CircuitBreakerRegistry();
    const inFlightTracker = new InFlightTracker();

    const { result } = renderHook(
      () =>
        useResilientMutation<string, unknown, { name: string }>({
          mutationFn,
          endpointKey: 'test:idempotency',
          dedupKey: (v) => `k:${v.name}`,
          idempotencyKey: (v) => `idem-${v.name}`,
          registry,
          inFlightTracker,
        }),
      { wrapper: makeWrapper() },
    );

    await act(async () => {
      await result.current.mutateAsync({ name: 'preset-1' });
    });
    // mutationFn receives a spread copy with the extra field
    expect(seen[0]).toMatchObject({ name: 'preset-1', __idempotencyKey: 'idem-preset-1' });
  });

  it('does not retry 4xx responses', async () => {
    const err = makeAxiosError(422);
    const mutationFn = vi.fn(async () => {
      throw err;
    });
    const registry = new CircuitBreakerRegistry();
    const inFlightTracker = new InFlightTracker();

    const { result } = renderHook(
      () =>
        useResilientMutation<string, unknown, string>({
          mutationFn,
          endpointKey: 'test:non-retryable',
          dedupKey: (v) => `k:${v}`,
          retry: { maxRetries: 5, initialDelayMs: 1, sleep: async () => {} },
          registry,
          inFlightTracker,
        }),
      { wrapper: makeWrapper() },
    );

    await act(async () => {
      await expect(result.current.mutateAsync('a')).rejects.toBe(err);
    });
    expect(mutationFn).toHaveBeenCalledTimes(1);
  });

  it('triggers onSuccess after a retried success', async () => {
    let calls = 0;
    const mutationFn = vi.fn(async () => {
      calls += 1;
      if (calls < 2) throw makeAxiosError(502);
      return 'ok';
    });
    const onSuccess = vi.fn();
    const registry = new CircuitBreakerRegistry();
    const inFlightTracker = new InFlightTracker();

    const { result } = renderHook(
      () =>
        useResilientMutation<string, unknown, string>({
          mutationFn,
          endpointKey: 'test:on-success',
          dedupKey: (v) => `k:${v}`,
          retry: { maxRetries: 3, initialDelayMs: 1, sleep: async () => {} },
          registry,
          inFlightTracker,
          onSuccess,
        }),
      { wrapper: makeWrapper() },
    );

    await act(async () => {
      await result.current.mutateAsync('v');
    });
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });
});
