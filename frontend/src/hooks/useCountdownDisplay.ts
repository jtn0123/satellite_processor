import { useState, useEffect, useRef, useCallback } from 'react';

export function useCountdownDisplay(refreshInterval: number) {
  const nextRefreshAt = useRef(0);

  useEffect(() => {
    nextRefreshAt.current = Date.now() + refreshInterval;
  }, [refreshInterval]);

  const resetCountdown = useCallback(() => {
    nextRefreshAt.current = Date.now() + refreshInterval;
  }, [refreshInterval]);

  const [display, setDisplay] = useState(() => {
    const sec = Math.max(0, Math.ceil(refreshInterval / 1000));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((nextRefreshAt.current - Date.now()) / 1000));
      if (remaining <= 0) {
        nextRefreshAt.current = Date.now() + refreshInterval;
      }
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      setDisplay(`${m}:${s.toString().padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(timer);
  }, [refreshInterval]);

  return { display, resetCountdown };
}
