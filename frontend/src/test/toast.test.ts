import { describe, it, expect, vi, beforeEach } from 'vitest';
import { showToast, subscribeToast } from '../utils/toast';
import type { ToastMessage } from '../utils/toast';

describe('toast pub/sub', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-1234' });
  });

  it('subscriber receives toast on showToast', () => {
    const received: ToastMessage[] = [];
    const unsub = subscribeToast((t) => received.push(t));

    showToast('success', 'It worked!');

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe('success');
    expect(received[0].message).toBe('It worked!');
    expect(received[0].id).toBe('test-uuid-1234');
    expect(received[0].createdAt).toBeGreaterThan(0);

    unsub();
  });

  it('unsubscribe stops receiving toasts', () => {
    const received: ToastMessage[] = [];
    const unsub = subscribeToast((t) => received.push(t));

    showToast('info', 'first');
    unsub();
    showToast('info', 'second');

    expect(received).toHaveLength(1);
    expect(received[0].message).toBe('first');
  });

  it('multiple subscribers all receive the toast', () => {
    const a: ToastMessage[] = [];
    const b: ToastMessage[] = [];
    const unsubA = subscribeToast((t) => a.push(t));
    const unsubB = subscribeToast((t) => b.push(t));

    showToast('error', 'oops');

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);

    unsubA();
    unsubB();
  });

  it('handles all toast types', () => {
    const received: ToastMessage[] = [];
    const unsub = subscribeToast((t) => received.push(t));

    showToast('success', 's');
    showToast('error', 'e');
    showToast('warning', 'w');
    showToast('info', 'i');

    expect(received.map((t) => t.type)).toEqual(['success', 'error', 'warning', 'info']);

    unsub();
  });
});
