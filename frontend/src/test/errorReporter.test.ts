import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Need to test both dev and prod paths. Use dynamic import.
describe('errorReporter', () => {
  let reportError: typeof import('../utils/errorReporter').reportError;
  let onError: typeof import('../utils/errorReporter').onError;
  let getErrorLog: typeof import('../utils/errorReporter').getErrorLog;
  let clearErrorLog: typeof import('../utils/errorReporter').clearErrorLog;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../utils/errorReporter');
    reportError = mod.reportError;
    onError = mod.onError;
    getErrorLog = mod.getErrorLog;
    clearErrorLog = mod.clearErrorLog;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('captures Error instances with message and stack', () => {
    const err = new Error('test error');
    reportError(err, 'test-context');
    const log = getErrorLog();
    expect(log).toHaveLength(1);
    expect(log[0].message).toBe('test error');
    expect(log[0].stack).toBeDefined();
    expect(log[0].context).toBe('test-context');
    expect(log[0].timestamp).toBeTruthy();
  });

  it('captures non-Error values as strings', () => {
    reportError('string error');
    const log = getErrorLog();
    expect(log).toHaveLength(1);
    expect(log[0].message).toBe('string error');
    expect(log[0].stack).toBeUndefined();
  });

  it('captures numeric error values', () => {
    reportError(42);
    expect(getErrorLog()[0].message).toBe('42');
  });

  it('limits error log to 100 entries', () => {
    for (let i = 0; i < 110; i++) {
      reportError(`error-${i}`);
    }
    const log = getErrorLog();
    expect(log.length).toBeLessThanOrEqual(100);
    // Most recent errors should be present
    expect(log[log.length - 1].message).toBe('error-109');
  });

  it('clearErrorLog empties the log', () => {
    reportError('one');
    reportError('two');
    expect(getErrorLog()).toHaveLength(2);
    clearErrorLog();
    expect(getErrorLog()).toHaveLength(0);
  });

  it('onError subscriber receives reports', () => {
    const subscriber = vi.fn();
    const unsub = onError(subscriber);

    reportError(new Error('sub test'), 'ctx');
    expect(subscriber).toHaveBeenCalledOnce();
    expect(subscriber.mock.calls[0][0].message).toBe('sub test');
    expect(subscriber.mock.calls[0][0].context).toBe('ctx');

    unsub();
  });

  it('unsubscribe stops receiving reports', () => {
    const subscriber = vi.fn();
    const unsub = onError(subscriber);

    reportError('before');
    expect(subscriber).toHaveBeenCalledTimes(1);

    unsub();
    reportError('after');
    expect(subscriber).toHaveBeenCalledTimes(1); // no new calls
  });

  it('subscriber errors do not cascade', () => {
    const badSub = vi.fn(() => { throw new Error('subscriber crash'); });
    const goodSub = vi.fn();
    onError(badSub);
    onError(goodSub);

    // Should not throw
    reportError('test');
    expect(badSub).toHaveBeenCalledOnce();
    expect(goodSub).toHaveBeenCalledOnce();
  });

  it('logs to console in dev mode', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    reportError(new Error('dev error'), 'dev-ctx');

    // In test environment, import.meta.env.DEV is true
    expect(consoleSpy).toHaveBeenCalledWith(
      '[ErrorReporter] dev-ctx:',
      'dev error',
      expect.any(String),
    );
    consoleSpy.mockRestore();
  });

  it('includes URL and userAgent in report', () => {
    reportError('ua test');
    const report = getErrorLog()[0];
    expect(report.url).toBeDefined();
    expect(report.userAgent).toBeDefined();
  });

  it('handles undefined context gracefully', () => {
    reportError('no context');
    const report = getErrorLog()[0];
    expect(report.context).toBeUndefined();
  });

  it('default export is reportError', async () => {
    vi.resetModules();
    const mod = await import('../utils/errorReporter');
    expect(mod.default).toBe(mod.reportError);
  });
});
