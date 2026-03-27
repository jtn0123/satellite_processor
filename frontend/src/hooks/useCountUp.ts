import { useState, useEffect, useRef } from 'react';

/** Animated number count-up using requestAnimationFrame with ease-out cubic easing. */
export function useCountUp(target: number, duration = 800): number {
  const [value, setValue] = useState(0);
  const prev = useRef(0);

  useEffect(() => {
    const start = prev.current;
    const diff = target - start;
    if (diff === 0) return;

    // Skip animation when user prefers reduced motion
    const prefersReducedMotion =
      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;

    const startTime = performance.now();
    let raf: number;

    const step = (now: number) => {
      if (prefersReducedMotion) {
        setValue(target);
        prev.current = target;
        return;
      }
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
