import { useEffect, useRef } from 'react';

type KeyHandler = () => void;
type ShortcutMap = Record<string, KeyHandler>;

/**
 * Simple hotkey hook supporting single keys and two-key sequences (e.g. "g d").
 * Ignores keypresses when an input/textarea/select is focused.
 */
export function useHotkeys(shortcuts: ShortcutMap) {
  const pendingRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key;

      // Check for two-key sequence
      if (pendingRef.current) {
        const combo = `${pendingRef.current} ${key}`;
        pendingRef.current = null;
        if (timerRef.current) clearTimeout(timerRef.current);
        if (shortcuts[combo]) {
          e.preventDefault();
          shortcuts[combo]();
          return;
        }
      }

      // Check single-key shortcut
      if (shortcuts[key]) {
        e.preventDefault();
        shortcuts[key]();
        return;
      }

      // Start sequence
      const hasSequence = Object.keys(shortcuts).some((k) => k.startsWith(`${key} `));
      if (hasSequence) {
        pendingRef.current = key;
        timerRef.current = setTimeout(() => {
          pendingRef.current = null;
        }, 500);
      }
    };

    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [shortcuts]);
}
