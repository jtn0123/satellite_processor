import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reportError, onError, getErrorLog, clearErrorLog } from '../utils/errorReporter';

describe('errorReporter', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearErrorLog();
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('logs errors to the error log', () => {
    reportError(new Error('test error'), 'TestContext');
    const log = getErrorLog();
    expect(log).toHaveLength(1);
    expect(log[0].message).toBe('test error');
    expect(log[0].context).toBe('TestContext');
    expect(log[0].timestamp).toBeTruthy();
  });

  it('handles non-Error values', () => {
    reportError('string error');
    const log = getErrorLog();
    expect(log).toHaveLength(1);
    expect(log[0].message).toBe('string error');
    expect(log[0].stack).toBeUndefined();
  });

  it('includes stack trace for Error objects', () => {
    reportError(new Error('with stack'), 'ctx');
    const log = getErrorLog();
    expect(log[0].stack).toBeDefined();
    expect(log[0].stack).toContain('with stack');
  });

  it('clears the error log', () => {
    reportError(new Error('err1'));
    reportError(new Error('err2'));
    expect(getErrorLog()).toHaveLength(2);
    clearErrorLog();
    expect(getErrorLog()).toHaveLength(0);
  });

  it('notifies subscribers on error', () => {
    const subscriber = vi.fn();
    const unsub = onError(subscriber);
    reportError(new Error('sub test'), 'SubCtx');
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(subscriber).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'sub test', context: 'SubCtx' }),
    );
    unsub();
  });

  it('unsubscribe stops notifications', () => {
    const subscriber = vi.fn();
    const unsub = onError(subscriber);
    unsub();
    reportError(new Error('after unsub'));
    expect(subscriber).not.toHaveBeenCalled();
  });

  it('subscriber errors do not cascade', () => {
    const badSubscriber = vi.fn(() => {
      throw new Error('subscriber boom');
    });
    const goodSubscriber = vi.fn();
    onError(badSubscriber);
    onError(goodSubscriber);
    reportError(new Error('cascade test'));
    expect(badSubscriber).toHaveBeenCalledTimes(1);
    expect(goodSubscriber).toHaveBeenCalledTimes(1);
  });

  it('accumulates multiple errors', () => {
    reportError(new Error('e1'));
    reportError(new Error('e2'));
    reportError(new Error('e3'));
    expect(getErrorLog()).toHaveLength(3);
  });

  it('reports without context', () => {
    reportError(new Error('no ctx'));
    const log = getErrorLog();
    expect(log[0].context).toBeUndefined();
  });

  it('logs to console.error in dev mode', () => {
    reportError(new Error('dev log'), 'DevCtx');
    expect(consoleSpy).toHaveBeenCalled();
  });
});
