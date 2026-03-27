import { useState, useEffect, useRef } from 'react';

/** Animated number count-up using requestAnimationFrame with ease-out cubic easing. */
export function useCountUp(target: number, duration = 800): number {
  const [value, setValue] = useState(0);
  const prev = useRef(0);

  useEffect(() => {
    const start = prev.current;
    const diff = target - start;
    if (diff === 0) return;

    const startTime = performance.now();
    let raf: number;

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setValue(Math.round(start + diff * eased));
      if (progress < 1) {
        raf = requestAnimationFrame(step);
      } else {
        prev.current = target;
      }
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}
