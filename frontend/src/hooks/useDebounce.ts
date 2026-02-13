import { useState, useEffect } from 'react';

/**
 * Debounce a value by the given delay (ms).
 * Returns the debounced value that only updates after the delay has passed
 * since the last change.
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}
